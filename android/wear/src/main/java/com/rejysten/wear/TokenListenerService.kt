package com.rejysten.wear

import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

/**
 * Receives the ID token the phone publishes to the Data Layer and hands it to
 * [TokenStore]. Runs even when the watch app is not open, so a token pushed while
 * the app was dead is already cached the next time it starts.
 */
class TokenListenerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        events.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED) return@forEach
            if (event.dataItem.uri.path != TokenTransfer.DATA_PATH) return@forEach
            val token = DataMapItem.fromDataItem(event.dataItem).dataMap.getString(TokenTransfer.KEY_TOKEN)
            // Logged by length and fingerprint, never in full: this is the only place
            // that can show whether the phone's push actually crossed the Data Layer.
            Log.i(
                TokenStore.TAG,
                "received a token: len=${token?.length ?: 0} fp=${token?.hashCode()}",
            )
            if (!token.isNullOrEmpty()) TokenStore.get(this).save(token)
        }
    }
}
