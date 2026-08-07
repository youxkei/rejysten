package com.rejysten.mobile

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await

/** Wear Data Layer paths and keys; the watch side must agree (see wear/TokenStore.kt). */
object TokenTransfer {
    const val DATA_PATH = "/id-token"
    const val REQUEST_PATH = "/token-request"
    const val KEY_TOKEN = "token"
    const val KEY_REFRESHED_AT = "refreshedAt"
    const val KEY_REQUESTED_AT = "requestedAt"
}

/**
 * Publishes the phone's Firebase ID token to the paired watch.
 *
 * A DataClient item is used rather than a message because it is retained: a watch
 * that was asleep or had the app killed still sees the latest token once it
 * reconnects, which matches how sporadically the watch is used.
 */
class TokenSync(private val context: Context, private val controller: GoogleSignInController) {
    companion object {
        const val TAG = "RejystenToken"
    }

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
        val item = Wearable.getDataClient(context).putDataItem(request.asPutDataRequest().setUrgent()).await()
        // A successful put only means the phone stored it; whether it crossed to the
        // watch shows up in the watch's own log. Matching fingerprints tie the two.
        Log.i(
            TAG,
            "published a token (forceRefresh=$forceRefresh): len=${token.length} fp=${token.hashCode()} uri=${item.uri}",
        )
        return true
    }
}
