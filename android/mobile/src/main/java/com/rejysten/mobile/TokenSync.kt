package com.rejysten.mobile

import android.content.Context
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await

/** Wear Data Layer paths and keys; the watch side must agree (see wear/TokenStore.kt). */
object TokenTransfer {
    const val DATA_PATH = "/id-token"
    const val REQUEST_PATH = "/request-id-token"
    const val KEY_TOKEN = "token"
    const val KEY_REFRESHED_AT = "refreshedAt"
}

/**
 * Publishes the phone's Firebase ID token to the paired watch.
 *
 * A DataClient item is used rather than a message because it is retained: a watch
 * that was asleep or had the app killed still sees the latest token once it
 * reconnects, which matches how sporadically the watch is used.
 */
class TokenSync(private val context: Context, private val controller: GoogleSignInController) {
    /** Returns false when signed out, i.e. there is no token to publish. */
    suspend fun push(forceRefresh: Boolean = false): Boolean {
        val token = controller.freshIdToken(forceRefresh) ?: return false
        val request = PutDataMapRequest.create(TokenTransfer.DATA_PATH).apply {
            dataMap.putString(TokenTransfer.KEY_TOKEN, token)
            // The Data Layer drops a put whose payload is byte-identical to the stored
            // item, so re-pushing a still-valid token would never reach the watch (and
            // the watch waits for a *change*) without something that always varies.
            dataMap.putLong(TokenTransfer.KEY_REFRESHED_AT, System.currentTimeMillis())
        }
        Wearable.getDataClient(context).putDataItem(request.asPutDataRequest().setUrgent()).await()
        return true
    }
}
