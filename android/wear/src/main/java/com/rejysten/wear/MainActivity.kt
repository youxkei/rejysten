package com.rejysten.wear

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Duration
import java.time.Instant

/**
 * Skeleton Wear OS UI: two buttons that drive the lifeLog HTTP endpoints through
 * [LifeLogClient]. This proves the toolchain and the client compile and lay out;
 * the token hand-off and the switch-candidate picker are wired later.
 */
// The line only ever shows whole minutes, so ticking faster would redraw the same
// text; ticking slower would let it sit a minute behind what the wearer sees.
private const val TICK_MS = 20_000L

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { WearApp() }
    }
}

@Composable
private fun WearApp() {
    val context = LocalContext.current
    val store = remember { TokenStore.get(context) }
    val client = remember {
        LifeLogClient(
            // Per build type: prod on release, the dev Pages project on debug.
            baseUrl = BuildConfig.BASE_URL,
            idTokenProvider = { forceRefresh ->
                // A cache miss is also a reason to ask the phone: the watch app may
                // never have received a push (fresh install, cleared data).
                if (forceRefresh) store.requestFresh() else store.cached() ?: store.requestFresh()
            },
        )
    }
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf("ready") }
    var picking by remember { mutableStateOf<List<LifeLogClient.SwitchCandidate>?>(null) }
    // The entry itself rather than a rendered line, so the elapsed time can be
    // recomputed from its startAt without asking the endpoint again.
    var currentState by remember { mutableStateOf<LifeLogClient.CurrentState?>(null) }
    var now by remember { mutableStateOf(Instant.now()) }

    // What is running right now, refreshed on open and after anything that changes it.
    // Without it the buttons are pressed blind: the watch could not tell a stopped
    // timeline from a running one, so Start on an already-open entry looked the same.
    val refreshCurrent: () -> Unit = {
        scope.launch {
            currentState = try {
                withContext(Dispatchers.IO) { client.current() }
            } catch (t: Throwable) {
                LifeLogClient.CurrentState.Rejected(0, t.message ?: "error")
            }
            now = Instant.now()
        }
    }
    LaunchedEffect(Unit) { refreshCurrent() }

    // Ticks the clock rather than re-reading the endpoint: how long the entry has run
    // is derivable from a startAt already in hand, and a watch is mostly looked at
    // rather than pressed, so a line frozen at the moment of the last tap is the one
    // thing this display must not do. Compose stops composing while the screen is
    // off, which is when a wearable spends most of its time.
    LaunchedEffect(currentState) {
        while (true) {
            delay(TICK_MS)
            now = Instant.now()
        }
    }

    MaterialTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        ) {
            // Which deployment this build talks to. dev holds a copy of the real data,
            // so the entries alone look identical to production -- telling them apart
            // took a scripted comparison once, which is once too often.
            Text(text = Uri.parse(BuildConfig.BASE_URL).host ?: BuildConfig.BASE_URL)
            Text(text = describeCurrentState(currentState, now))
            Text(text = status)
            when (val candidates = picking) {
                null -> {
                    Button(
                        onClick = {
                            dispatch(scope, { client.start() }) {
                                status = it
                                refreshCurrent()
                            }
                        },
                    ) { Text("Start") }
                    Button(
                        onClick = {
                            dispatch(scope, { client.stop() }) {
                                status = it
                                refreshCurrent()
                            }
                        },
                    ) { Text("Stop") }
                    Button(
                        onClick = {
                            status = "loading…"
                            scope.launch {
                                // The client throws on transport failures (DNS, TLS, timeout),
                                // and an uncaught one here takes the whole watch app down.
                                val result = try {
                                    withContext(Dispatchers.IO) { client.switchCandidates() }
                                } catch (t: Throwable) {
                                    status = "error: ${t.message}"
                                    return@launch
                                }
                                when (result) {
                                    is LifeLogClient.CandidateList.Loaded -> {
                                        picking = result.candidates
                                        status = if (result.candidates.isEmpty()) "nothing to switch to" else "pick one"
                                    }
                                    is LifeLogClient.CandidateList.Rejected ->
                                        status = "candidates rejected: ${result.status} ${result.reason}"
                                    LifeLogClient.CandidateList.Unauthenticated ->
                                        status = "no token from phone"
                                }
                            }
                        },
                    ) { Text("Switch…") }
                    Button(
                        onClick = {
                            scope.launch {
                                val token = withContext(Dispatchers.IO) { store.cached() ?: store.requestFresh() }
                                status = describeToken(token)
                            }
                        },
                    ) { Text("Token") }
                    Button(
                        onClick = {
                            scope.launch {
                                val token = withContext(Dispatchers.IO) { store.requestFresh() }
                                status = describeToken(token)
                            }
                        },
                    ) { Text("Refresh") }
                }
                else -> {
                    candidates.forEach { candidate ->
                        Button(
                            onClick = {
                                picking = null
                                dispatch(scope, { client.switch(candidate.id) }) {
                                    status = it
                                    refreshCurrent()
                                }
                            },
                        ) { Text(candidate.text) }
                    }
                    Button(onClick = { picking = null; status = "ready" }) { Text("Cancel") }
                }
            }
        }
    }
}

/**
 * The line describing what is running, as of [now] rather than of when the endpoint
 * was last asked. Pure so the wording and the elapsed-time arithmetic are testable;
 * the caller supplies the clock and re-renders on a tick.
 *
 * An entry started from the watch carries no text until it is switched to a source,
 * so it is labelled untitled rather than left blank.
 */
internal fun describeCurrentState(state: LifeLogClient.CurrentState?, now: Instant): String =
    when (state) {
        null -> "…"
        is LifeLogClient.CurrentState.Rejected -> "? ${state.status} ${state.reason}"
        LifeLogClient.CurrentState.Unauthenticated -> "? no token"
        is LifeLogClient.CurrentState.Loaded -> {
            val current = state.current
            if (current == null) {
                "idle"
            } else {
                val label = current.text.ifEmpty { "(untitled)" }
                val startedAt = runCatching { Instant.parse(current.startAt) }.getOrNull()
                if (startedAt == null) label else "$label · ${elapsed(startedAt, now)}"
            }
        }
    }

// Clamped at zero: a watch whose clock runs behind the server's would otherwise
// render a negative age for an entry that has only just started.
private fun elapsed(startedAt: Instant, now: Instant): String {
    val minutes = Duration.between(startedAt, now).toMinutes().coerceAtLeast(0)
    return if (minutes < 60) "${minutes}m" else "${minutes / 60}h${minutes % 60}m"
}

// Identified by a fingerprint rather than its content: seeing that a refresh yielded
// a *different* token is the only way to tell a fresh push from a replayed DataItem,
// and a credential must not be rendered on screen to do it.
private fun describeToken(token: String?): String =
    if (token == null) "no token from phone" else "len=${token.length} fp=${token.hashCode()}"

private fun dispatch(
    scope: CoroutineScope,
    action: () -> LifeLogClient.Outcome,
    onResult: (String) -> Unit,
) {
    scope.launch {
        val result =
            try {
                withContext(Dispatchers.IO) { action() }.toString()
            } catch (t: Throwable) {
                "error: ${t.message}"
            }
        onResult(result)
    }
}
