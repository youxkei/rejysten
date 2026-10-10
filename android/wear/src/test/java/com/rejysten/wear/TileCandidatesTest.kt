package com.rejysten.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TileCandidatesTest {
    private val candidates = listOf(
        LifeLogClient.SwitchCandidate("019bef3b-4b0c-713a-b8fc-e2d57692732a", "ネットサーフィン"),
        LifeLogClient.SwitchCandidate("019fef2e-e66e-7c76-a0bb-be5f93cabfd2", "テスト"),
    )

    @Test
    fun `a list survives being stored and read back in the order it was fetched`() {
        assertEquals(candidates, candidatesFromJson(candidatesToJson(candidates)))
    }

    @Test
    fun `having nothing to switch to is stored, and reads back as an empty list`() {
        assertEquals(emptyList<LifeLogClient.SwitchCandidate>(), candidatesFromJson(candidatesToJson(emptyList())))
    }

    @Test
    fun `a name holding the separators the state key uses still round trips`() {
        val awkward = listOf(LifeLogClient.SwitchCandidate("log-1", "read\tthe\ndocs"))

        assertEquals(awkward, candidatesFromJson(candidatesToJson(awkward)))
    }

    @Test
    fun `nothing stored, and anything unreadable, reads as nothing known`() {
        assertNull(candidatesFromJson(null))
        assertNull(candidatesFromJson(""))
        assertNull(candidatesFromJson("not json"))
        // A record without the fields a candidate needs is no more usable than no record.
        assertNull(candidatesFromJson("""[{"id":"log-1"}]"""))
    }
}
