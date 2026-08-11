package com.rejysten.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TileStateKeyTest {
    private val running = LifeLogClient.CurrentState.Loaded(
        LifeLogClient.Current("log-1", "rejysten", "2026-08-10T16:53:59Z"),
    )

    @Test
    fun `a state survives being stored and read back`() {
        for (state in listOf(
            running,
            LifeLogClient.CurrentState.Loaded(null),
            LifeLogClient.CurrentState.Rejected(401, "unauthorized"),
            LifeLogClient.CurrentState.Unauthenticated,
        )) {
            assertEquals(state, currentStateFromKey(currentStateKey(state)))
        }
    }

    @Test
    fun `a failure compares equal to itself, so a tile showing it stops asking to be redrawn`() {
        val failure = LifeLogClient.CurrentState.Rejected(401, "unauthorized")

        assertEquals(currentStateKey(failure), currentStateKey(failure))
        assertNotEquals(currentStateKey(failure), currentStateKey(running))
        assertNotEquals(
            currentStateKey(failure),
            currentStateKey(LifeLogClient.CurrentState.Rejected(503, "contention")),
        )
    }

    @Test
    fun `nothing running is distinct from a failure to ask and from an entry`() {
        val idle = LifeLogClient.CurrentState.Loaded(null)

        assertNotEquals(currentStateKey(idle), currentStateKey(running))
        assertNotEquals(currentStateKey(idle), currentStateKey(LifeLogClient.CurrentState.Unauthenticated))
    }

    @Test
    fun `two entries differing only in when they started are different states`() {
        val later = LifeLogClient.CurrentState.Loaded(
            LifeLogClient.Current("log-1", "rejysten", "2026-08-10T17:53:59Z"),
        )

        assertNotEquals(currentStateKey(running), currentStateKey(later))
    }

    @Test
    fun `nothing stored yet reads as nothing known`() {
        assertNull(currentStateFromKey(null))
        assertNull(currentStateFromKey("something else"))
        // A truncated record is treated as unknown rather than read past its end.
        assertNull(currentStateFromKey("running"))
        assertNull(currentStateFromKey("error"))
    }
}
