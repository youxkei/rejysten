package com.rejysten.wear

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
            if (!token.isNullOrEmpty()) TokenStore.get(this).save(token)
        }
    }
}
