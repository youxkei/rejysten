package com.rejysten.wear

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Skeleton Wear OS UI: two buttons that drive the lifeLog HTTP endpoints through
 * [LifeLogClient]. This proves the toolchain and the client compile and lay out;
 * the token hand-off and the switch-candidate picker are wired later.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { WearApp() }
    }
}

@Composable
private fun WearApp() {
    val client = remember {
        LifeLogClient(
            // TODO: the Cloudflare Pages domain hosting functions/api/lifelog/*.
            baseUrl = "https://rejysten.example",
            // TODO: the watch is not signed in — the paired phone mints the Firebase
            // ID token and delivers it over the Wear Data Layer. Wire that here.
            idTokenProvider = { TODO("provide phone-delivered Firebase ID token") },
        )
    }
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf("ready") }

    MaterialTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        ) {
            Text(text = status)
            Button(onClick = { dispatch(scope, { client.start() }) { status = it } }) { Text("Start") }
            Button(onClick = { dispatch(scope, { client.stop() }) { status = it } }) { Text("Stop") }
        }
    }
}

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
