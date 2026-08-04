package com.rejysten.wear

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

    fun start(): Outcome =
        outcome(request("POST", "/api/lifelog/start", JSONObject())) { Outcome.Started(it.getString("id")) }

    fun stop(): Outcome =
        outcome(request("POST", "/api/lifelog/stop", JSONObject())) { Outcome.Stopped(it.getString("id")) }

    fun switch(sourceId: String): Outcome =
        outcome(request("POST", "/api/lifelog/switch", JSONObject().put("sourceId", sourceId))) { json ->
            Outcome.Switched(json.getString("id"), json.optString("stoppedId").ifEmpty { null })
        }

    fun switchCandidates(): List<SwitchCandidate> {
        val response = request("GET", "/api/lifelog/switch-candidates", null)
        if (response !is Response.Http || response.status != 200 || !response.json.optBoolean("ok")) {
            return emptyList()
        }
        val array: JSONArray = response.json.optJSONArray("candidates") ?: JSONArray()
        return (0 until array.length()).map {
            val entry = array.getJSONObject(it)
            SwitchCandidate(entry.getString("id"), entry.getString("text"))
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
        val token = idTokenProvider(false) ?: return Response.NoToken
        val payload = body?.toString()
        val first = transport.exchange(method, baseUrl + path, token, payload)
        if (first.first != HttpURLConnection.HTTP_UNAUTHORIZED) return first.toResponse()

        // ID tokens last ~1h and the watch is used sporadically, so a 401 is far more
        // likely to be an expired token than a genuine authorization failure. Retrying
        // with the same token would just fail again, so only retry on a changed one.
        val refreshed = idTokenProvider(true)
        if (refreshed == null || refreshed == token) return first.toResponse()
        return transport.exchange(method, baseUrl + path, refreshed, payload).toResponse()
    }

    private fun Pair<Int, String>.toResponse(): Response =
        Response.Http(first, if (second.isBlank()) JSONObject() else JSONObject(second))
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
