package com.rejysten.wear

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Thin HTTPS client for the lifeLog write endpoints under functions/api/lifelog/.
 *
 * By design this holds ZERO write-contract logic: it forwards a Firebase ID
 * token as a Bearer header and posts the command; the Cloudflare Pages Function
 * assembles the Firestore commit (see docs/external-write-path-refactoring.md).
 *
 * All calls block on the network, so invoke them off the main thread (e.g.
 * `withContext(Dispatchers.IO) { client.start() }`). The watch is not signed in:
 * [idTokenProvider] returns a token the paired phone delivered over the Wear Data
 * Layer, and is called with `forceRefresh = true` to ask for a newer one.
 */
class LifeLogClient(
    private val baseUrl: String,
    private val idTokenProvider: (forceRefresh: Boolean) -> String?,
    private val transport: Transport = HttpTransport(),
    // Injected rather than calling Log where it is used, for two reasons: the JVM
    // tests would have to stub android.util.Log to construct a client at all, and
    // what a request reports becomes something a test can read -- which is how the
    // rule that no line may carry the bearer token is held to.
    private val log: (String) -> Unit = { Log.i(TAG, it) },
) {
    /** One HTTP round trip, as a seam so the retry and parsing logic is unit-testable. */
    fun interface Transport {
        fun exchange(method: String, url: String, token: String, body: String?): Pair<Int, String>
    }

    sealed interface Outcome {
        data class Started(val id: String) : Outcome
        data class Stopped(val id: String) : Outcome
        data class Switched(val id: String, val stoppedId: String?) : Outcome

        /** Non-success responses: 409 no open entry, 404 source not found, 503 contention, … */
        data class Rejected(val status: Int, val reason: String) : Outcome

        /** The phone has not delivered a token, so no request was attempted. */
        data object Unauthenticated : Outcome
    }

    data class SwitchCandidate(val id: String, val text: String)

    /** The entry in progress; [text] is empty for one started without a source. */
    data class Current(val id: String, val text: String, val startAt: String)

    /** Reading the current entry keeps "nothing in progress" apart from "could not ask". */
    sealed interface CurrentState {
        data class Loaded(val current: Current?) : CurrentState
        data class Rejected(val status: Int, val reason: String) : CurrentState
        data object Unauthenticated : CurrentState
    }

    fun current(): CurrentState =
        when (val response = request("GET", "/api/lifelog/current", null)) {
            Response.NoToken -> CurrentState.Unauthenticated
            is Response.Http ->
                if (response.status == 200 && response.json.optBoolean("ok")) {
                    val entry = response.json.optJSONObject("current")
                    CurrentState.Loaded(
                        entry?.let {
                            Current(it.getString("id"), it.optString("text"), it.optString("startAt"))
                        },
                    )
                } else {
                    CurrentState.Rejected(response.status, response.json.optString("reason", "error"))
                }
        }

    /**
     * Reading candidates is kept distinct from an empty list: a picker that showed
     * "nothing to switch to" for an expired token would hide the one thing the user
     * can act on.
     */
    sealed interface CandidateList {
        data class Loaded(val candidates: List<SwitchCandidate>) : CandidateList
        data class Rejected(val status: Int, val reason: String) : CandidateList
        data object Unauthenticated : CandidateList
    }

    fun start(): Outcome =
        outcome(request("POST", "/api/lifelog/start", JSONObject())) { Outcome.Started(it.getString("id")) }

    fun stop(): Outcome =
        outcome(request("POST", "/api/lifelog/stop", JSONObject())) { Outcome.Stopped(it.getString("id")) }

    fun switch(sourceId: String): Outcome =
        outcome(request("POST", "/api/lifelog/switch", JSONObject().put("sourceId", sourceId))) { json ->
            Outcome.Switched(json.getString("id"), json.optString("stoppedId").ifEmpty { null })
        }

    fun switchCandidates(): CandidateList =
        when (val response = request("GET", "/api/lifelog/switch-candidates", null)) {
            Response.NoToken -> CandidateList.Unauthenticated
            is Response.Http ->
                if (response.status == 200 && response.json.optBoolean("ok")) {
                    val array: JSONArray = response.json.optJSONArray("candidates") ?: JSONArray()
                    CandidateList.Loaded(
                        (0 until array.length()).map {
                            val entry = array.getJSONObject(it)
                            SwitchCandidate(entry.getString("id"), entry.getString("text"))
                        },
                    )
                } else {
                    CandidateList.Rejected(response.status, response.json.optString("reason", "error"))
                }
        }

    private sealed interface Response {
        data class Http(val status: Int, val json: JSONObject) : Response
        data object NoToken : Response
    }

    private inline fun outcome(response: Response, onOk: (JSONObject) -> Outcome): Outcome =
        when (response) {
            Response.NoToken -> Outcome.Unauthenticated
            is Response.Http ->
                if (response.status == 200 && response.json.optBoolean("ok")) onOk(response.json)
                else Outcome.Rejected(response.status, response.json.optString("reason", "error"))
        }

    private fun request(method: String, path: String, body: JSONObject?): Response {
        val token = idTokenProvider(false)
        if (token == null) {
            log("$method $path: the phone has delivered no token")
            return Response.NoToken
        }
        val payload = body?.toString()
        val first = attempt(method, path, token, payload)
        if (first.first != HttpURLConnection.HTTP_UNAUTHORIZED) return first.toResponse()

        // ID tokens last ~1h and the watch is used sporadically, so a 401 is far more
        // likely to be an expired token than a genuine authorization failure. Retrying
        // with the same token would just fail again, so only retry on a changed one.
        val refreshed = idTokenProvider(true)
        if (refreshed == null || refreshed == token) {
            log("$method $path: 401, and the phone had no fresher token")
            return first.toResponse()
        }
        log("$method $path: 401, retrying with a fresher token")
        return attempt(method, path, refreshed, payload).toResponse()
    }

    // The whole URL and not just the path, so a log tells which deployment answered:
    // a debug APK left pointing at production is the mistake this is here to expose.
    private fun attempt(method: String, path: String, token: String, payload: String?): Pair<Int, String> {
        val url = baseUrl + path
        val startedAt = System.currentTimeMillis()
        return runCatching { transport.exchange(method, url, token, payload) }
            .onSuccess { log("$method $url -> ${it.first} in ${System.currentTimeMillis() - startedAt}ms") }
            .onFailure { log("$method $url failed after ${System.currentTimeMillis() - startedAt}ms: $it") }
            .getOrThrow()
    }

    private fun Pair<Int, String>.toResponse(): Response =
        Response.Http(first, if (second.isBlank()) JSONObject() else JSONObject(second))

    private companion object {
        const val TAG = "RejystenLifeLog"
    }
}

/** Default [LifeLogClient.Transport]: java.net over HTTPS. */
class HttpTransport(private val timeoutMs: Int = 10_000) : LifeLogClient.Transport {
    override fun exchange(method: String, url: String, token: String, body: String?): Pair<Int, String> {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) {
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            return status to stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        } finally {
            connection.disconnect()
        }
    }
}
