package com.rejysten.mobile

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.runBlocking

/**
 * Answers the watch's "I need a fresher token" request by minting one and
 * publishing it. This is what makes the watch's 401-retry path work: only the
 * phone can refresh a Firebase ID token, and the watch cannot wait for the user
 * to open the phone app.
 */
class TokenRequestService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != TokenTransfer.REQUEST_PATH) return
        Log.i(TokenSync.TAG, "the watch asked for a token")
        // Data Layer callbacks already run off the main thread, and the watch is
        // blocked waiting for the push, so complete it before returning.
        runBlocking {
            val pushed = runCatching {
                TokenSync(applicationContext, GoogleSignInController(getString(R.string.default_web_client_id)))
                    .push(forceRefresh = true)
            }
            // The watch only learns "timed out", so the reason has to be recorded here.
            pushed.onFailure { Log.w(TokenSync.TAG, "minting a token for the watch failed", it) }
            if (pushed.getOrNull() == false) Log.w(TokenSync.TAG, "the phone is signed out; nothing to push")
        }
    }
}
