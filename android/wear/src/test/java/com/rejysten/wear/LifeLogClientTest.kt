package com.rejysten.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LifeLogClientTest {
    private class FakeTransport(private vararg val responses: Pair<Int, String>) : LifeLogClient.Transport {
        data class Call(val method: String, val url: String, val token: String, val body: String?)

        val calls = mutableListOf<Call>()

        override fun exchange(method: String, url: String, token: String, body: String?): Pair<Int, String> {
            calls += Call(method, url, token, body)
            return responses[calls.size - 1]
        }
    }

    private fun client(
        transport: FakeTransport,
        tokens: List<String?> = listOf("token-1", "token-2"),
    ): LifeLogClient {
        val fresh = tokens.getOrNull(1)
        return LifeLogClient(
            baseUrl = "https://example.test",
            idTokenProvider = { forceRefresh -> if (forceRefresh) fresh else tokens.firstOrNull() },
            transport = transport,
        )
    }

    @Test
    fun `start posts to the start endpoint with a bearer token and returns the new id`() {
        val transport = FakeTransport(200 to """{"ok":true,"id":"log-1"}""")

        val outcome = client(transport).start()

        assertEquals(LifeLogClient.Outcome.Started("log-1"), outcome)
        assertEquals(
            FakeTransport.Call("POST", "https://example.test/api/lifelog/start", "token-1", "{}"),
            transport.calls.single(),
        )
    }

    @Test
    fun `stop returns the closed entry id`() {
        val transport = FakeTransport(200 to """{"ok":true,"id":"log-2"}""")

        assertEquals(LifeLogClient.Outcome.Stopped("log-2"), client(transport).stop())
        assertEquals("https://example.test/api/lifelog/stop", transport.calls.single().url)
    }

    @Test
    fun `switch sends the sourceId and reports both the new and the stopped entry`() {
        val transport = FakeTransport(200 to """{"ok":true,"id":"log-4","stoppedId":"log-3"}""")

        val outcome = client(transport).switch("source-1")

        assertEquals(LifeLogClient.Outcome.Switched("log-4", "log-3"), outcome)
        assertEquals("""{"sourceId":"source-1"}""", transport.calls.single().body)
    }

    @Test
    fun `switch reports a null stoppedId when nothing was open`() {
        val transport = FakeTransport(200 to """{"ok":true,"id":"log-5"}""")

        assertEquals(LifeLogClient.Outcome.Switched("log-5", null), client(transport).switch("source-1"))
    }

    @Test
    fun `a non-success response becomes Rejected carrying the status and reason`() {
        val transport = FakeTransport(409 to """{"ok":false,"reason":"no open entry"}""")

        assertEquals(LifeLogClient.Outcome.Rejected(409, "no open entry"), client(transport).stop())
    }

    @Test
    fun `a non-success response without a body still reports its status`() {
        val transport = FakeTransport(503 to "")

        assertEquals(LifeLogClient.Outcome.Rejected(503, "error"), client(transport).start())
    }

    @Test
    fun `no request is attempted while the phone has delivered no token`() {
        val transport = FakeTransport()

        val outcome = client(transport, tokens = listOf(null)).start()

        assertEquals(LifeLogClient.Outcome.Unauthenticated, outcome)
        assertTrue(transport.calls.isEmpty())
    }

    @Test
    fun `a 401 refreshes the token and retries once with the newer one`() {
        val transport = FakeTransport(
            401 to """{"ok":false,"reason":"unauthorized"}""",
            200 to """{"ok":true,"id":"log-6"}""",
        )

        val outcome = client(transport).start()

        assertEquals(LifeLogClient.Outcome.Started("log-6"), outcome)
        assertEquals(listOf("token-1", "token-2"), transport.calls.map { it.token })
    }

    @Test
    fun `a 401 that survives the refresh is reported and not retried again`() {
        val transport = FakeTransport(
            401 to """{"ok":false,"reason":"unauthorized"}""",
            401 to """{"ok":false,"reason":"unauthorized"}""",
        )

        val outcome = client(transport).start()

        assertEquals(LifeLogClient.Outcome.Rejected(401, "unauthorized"), outcome)
        assertEquals(2, transport.calls.size)
    }

    @Test
    fun `a 401 is not retried when the refresh yields the same token`() {
        val transport = FakeTransport(401 to """{"ok":false,"reason":"unauthorized"}""")

        val outcome = client(transport, tokens = listOf("token-1", "token-1")).start()

        assertEquals(LifeLogClient.Outcome.Rejected(401, "unauthorized"), outcome)
        assertEquals(1, transport.calls.size)
    }

    @Test
    fun `a 401 is not retried when no fresher token can be obtained`() {
        val transport = FakeTransport(401 to """{"ok":false,"reason":"unauthorized"}""")

        val outcome = client(transport, tokens = listOf("token-1", null)).start()

        assertEquals(LifeLogClient.Outcome.Rejected(401, "unauthorized"), outcome)
        assertEquals(1, transport.calls.size)
    }

    @Test
    fun `the current entry is reported with the text and start the endpoint returned`() {
        val transport = FakeTransport(
            200 to """{"ok":true,"current":{"id":"log-1","text":"work","startAt":"2026-08-07T17:25:28.000Z"}}""",
        )

        val state = client(transport).current()

        assertEquals(
            LifeLogClient.CurrentState.Loaded(
                LifeLogClient.Current("log-1", "work", "2026-08-07T17:25:28.000Z"),
            ),
            state,
        )
        assertEquals("GET", transport.calls.single().method)
        assertEquals("https://example.test/api/lifelog/current", transport.calls.single().url)
    }

    @Test
    fun `nothing in progress is distinct from failing to ask`() {
        val idle = FakeTransport(200 to """{"ok":true,"current":null}""")
        val rejected = FakeTransport(503 to """{"ok":false,"reason":"contention"}""", 503 to "")

        assertEquals(LifeLogClient.CurrentState.Loaded(null), client(idle).current())
        assertEquals(LifeLogClient.CurrentState.Rejected(503, "contention"), client(rejected).current())
    }

    @Test
    fun `the current entry is not requested while the phone has delivered no token`() {
        val transport = FakeTransport()

        val state = client(transport, tokens = listOf(null)).current()

        assertEquals(LifeLogClient.CurrentState.Unauthenticated, state)
        assertTrue(transport.calls.isEmpty())
    }

    @Test
    fun `an entry started without a source reports an empty text`() {
        val transport = FakeTransport(
            200 to """{"ok":true,"current":{"id":"log-2","startAt":"2026-08-07T17:25:28.000Z"}}""",
        )

        val state = client(transport).current()

        assertEquals(
            LifeLogClient.CurrentState.Loaded(LifeLogClient.Current("log-2", "", "2026-08-07T17:25:28.000Z")),
            state,
        )
    }

    @Test
    fun `switch candidates are parsed in the order the endpoint returned them`() {
        val transport = FakeTransport(
            200 to """{"ok":true,"candidates":[{"id":"a","text":"work"},{"id":"b","text":"rest"}]}""",
        )

        val candidates = client(transport).switchCandidates()

        assertEquals(
            LifeLogClient.CandidateList.Loaded(
                listOf(
                    LifeLogClient.SwitchCandidate("a", "work"),
                    LifeLogClient.SwitchCandidate("b", "rest"),
                ),
            ),
            candidates,
        )
        assertEquals("GET", transport.calls.single().method)
        assertEquals(null, transport.calls.single().body)
    }

    @Test
    fun `having nothing to switch to is distinct from failing to ask`() {
        val loaded = FakeTransport(200 to """{"ok":true,"candidates":[]}""")
        val rejected = FakeTransport(503 to """{"ok":false,"reason":"contention"}""", 503 to "")

        assertEquals(LifeLogClient.CandidateList.Loaded(emptyList()), client(loaded).switchCandidates())
        assertEquals(
            LifeLogClient.CandidateList.Rejected(503, "contention"),
            client(rejected).switchCandidates(),
        )
    }

    @Test
    fun `switch candidates report the rejection when the refreshed token is still unauthorized`() {
        val transport = FakeTransport(401 to "", 401 to "")

        assertEquals(
            LifeLogClient.CandidateList.Rejected(401, "error"),
            client(transport).switchCandidates(),
        )
        assertEquals(2, transport.calls.size)
    }

    @Test
    fun `switch candidates are not requested while the phone has delivered no token`() {
        val transport = FakeTransport()

        val candidates = client(transport, tokens = listOf(null)).switchCandidates()

        assertEquals(LifeLogClient.CandidateList.Unauthenticated, candidates)
        assertTrue(transport.calls.isEmpty())
    }
}
