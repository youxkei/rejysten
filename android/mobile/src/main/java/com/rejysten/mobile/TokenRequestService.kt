package com.rejysten.mobile

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
        // Data Layer callbacks already run off the main thread, and the watch is
        // blocked waiting for the push, so complete it before returning.
        runBlocking {
            TokenSync(applicationContext, GoogleSignInController(getString(R.string.default_web_client_id)))
                .push(forceRefresh = true)
        }
    }
}
