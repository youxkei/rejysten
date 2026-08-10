package com.rejysten.wear

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class CurrentLineTest {
    private val startedAt = Instant.parse("2026-08-10T16:53:59Z")

    private fun loaded(text: String, startAt: String = startedAt.toString()) =
        LifeLogClient.CurrentState.Loaded(LifeLogClient.Current("log-1", text, startAt))

    private fun lineAfterMinutes(minutes: Long) =
        describeCurrentState(loaded("rejysten"), startedAt.plusSeconds(minutes * 60))

    @Test
    fun `the line names the entry and how long it has run`() {
        assertEquals("rejysten · 11m", lineAfterMinutes(11))
    }

    @Test
    fun `the elapsed time keeps growing as the clock ticks past the last refresh`() {
        assertEquals("rejysten · 0m", lineAfterMinutes(0))
        assertEquals("rejysten · 1m", lineAfterMinutes(1))
        assertEquals("rejysten · 59m", lineAfterMinutes(59))
    }

    @Test
    fun `an hour and beyond reads as hours and minutes`() {
        assertEquals("rejysten · 1h0m", lineAfterMinutes(60))
        assertEquals("rejysten · 1h1m", lineAfterMinutes(61))
        assertEquals("rejysten · 71h22m", lineAfterMinutes(71 * 60 + 22))
    }

    @Test
    fun `a watch clock running behind the server reads as zero, never negative`() {
        assertEquals("rejysten · 0m", describeCurrentState(loaded("rejysten"), startedAt.minusSeconds(90)))
    }

    @Test
    fun `an entry started from the watch reads as untitled until it is switched`() {
        assertEquals("(untitled) · 5m", describeCurrentState(loaded(""), startedAt.plusSeconds(300)))
    }

    @Test
    fun `an unparsable start leaves the entry named without a duration`() {
        assertEquals("rejysten", describeCurrentState(loaded("rejysten", startAt = ""), startedAt))
    }

    @Test
    fun `nothing running reads as idle`() {
        assertEquals("idle", describeCurrentState(LifeLogClient.CurrentState.Loaded(null), startedAt))
    }

    @Test
    fun `a failure to ask is distinguishable from nothing running`() {
        assertEquals("? 503 contention", describeCurrentState(LifeLogClient.CurrentState.Rejected(503, "contention"), startedAt))
        assertEquals("? no token", describeCurrentState(LifeLogClient.CurrentState.Unauthenticated, startedAt))
    }

    @Test
    fun `the line is a placeholder until the first answer arrives`() {
        assertEquals("…", describeCurrentState(null, startedAt))
    }
}
