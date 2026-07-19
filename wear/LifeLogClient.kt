package com.rejysten.wear

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Thin HTTPS client for the lifeLog write endpoints (functions/api/lifelog/*).
 *
 * By design this holds ZERO write-contract logic: it forwards a Firebase ID
 * token as a Bearer header and posts the command; the Cloudflare Pages Function
 * assembles the Firestore commit (see docs/external-write-path-refactoring.md).
 *
 * All calls block on the network, so invoke them off the main thread (e.g.
 * `withContext(Dispatchers.IO) { client.start() }`). `idTokenProvider` must
 * return a fresh Firebase ID token for the signed-in Google account (the same
 * account/uid the Web app uses); wire it to FirebaseAuth — see wear/README.md.
 */
class LifeLogClient(
    private val baseUrl: String,
    private val idTokenProvider: () -> String,
    private val timeoutMs: Int = 10_000,
) {
    sealed interface Outcome {
        data class Started(val id: String) : Outcome
        data class Stopped(val id: String) : Outcome
        data class Switched(val id: String, val stoppedId: String?) : Outcome

        /** Non-success responses: 401 unauthorized, 409 no open entry, 404 source not found, 503 contention, … */
        data class Rejected(val status: Int, val reason: String) : Outcome
    }

    data class SwitchCandidate(val id: String, val text: String)

    fun start(): Outcome {
        val (status, json) = request("POST", "/api/lifelog/start", JSONObject())
        return if (status == 200 && json.optBoolean("ok")) Outcome.Started(json.getString("id"))
        else rejected(status, json)
    }

    fun stop(): Outcome {
        val (status, json) = request("POST", "/api/lifelog/stop", JSONObject())
        return if (status == 200 && json.optBoolean("ok")) Outcome.Stopped(json.getString("id"))
        else rejected(status, json)
    }

    fun switch(sourceId: String): Outcome {
        val body = JSONObject().put("sourceId", sourceId)
        val (status, json) = request("POST", "/api/lifelog/switch", body)
        return if (status == 200 && json.optBoolean("ok")) {
            Outcome.Switched(json.getString("id"), json.optString("stoppedId").ifEmpty { null })
        } else rejected(status, json)
    }

    fun switchCandidates(): List<SwitchCandidate> {
        val (status, json) = request("GET", "/api/lifelog/switch-candidates", null)
        if (status != 200 || !json.optBoolean("ok")) return emptyList()
        val array: JSONArray = json.optJSONArray("candidates") ?: JSONArray()
        return (0 until array.length()).map {
            val entry = array.getJSONObject(it)
            SwitchCandidate(entry.getString("id"), entry.getString("text"))
        }
    }

    private fun rejected(status: Int, json: JSONObject): Outcome.Rejected =
        Outcome.Rejected(status, json.optString("reason", "error"))

    private fun request(method: String, path: String, body: JSONObject?): Pair<Int, JSONObject> {
        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            setRequestProperty("Authorization", "Bearer ${idTokenProvider()}")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) {
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            return status to if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }
}
