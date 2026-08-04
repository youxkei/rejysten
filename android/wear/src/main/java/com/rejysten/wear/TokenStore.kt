package com.rejysten.wear

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/** Wear Data Layer paths and keys; the phone side must agree (see mobile/TokenSync.kt). */
object TokenTransfer {
    const val DATA_PATH = "/id-token"
    const val REQUEST_PATH = "/request-id-token"
    const val KEY_TOKEN = "token"
    const val KEY_REFRESHED_AT = "refreshedAt"
}

/**
 * The watch's copy of the Firebase ID token the paired phone mints.
 *
 * The watch never signs in, so this is the only source of credentials. Tokens are
 * persisted because the watch app is killed aggressively and re-asking the phone on
 * every launch would make the first action wait on the Data Layer.
 *
 * [requestFresh] blocks, so call it off the main thread — it is reached through
 * `LifeLogClient`'s idTokenProvider, which already runs on Dispatchers.IO.
 */
class TokenStore private constructor(private val context: Context) {
    companion object {
        private const val PREFS = "id-token"
        private val LOCK = Any()

        @Volatile
        private var instance: TokenStore? = null

        fun get(context: Context): TokenStore =
            instance ?: synchronized(LOCK) {
                instance ?: TokenStore(context.applicationContext).also { instance = it }
            }
    }

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val lock = ReentrantLock()
    private val saved = lock.newCondition()

    fun cached(): String? = prefs.getString(TokenTransfer.KEY_TOKEN, null)

    /** Called by [TokenListenerService] when the phone pushes a token. */
    fun save(token: String) {
        prefs.edit().putString(TokenTransfer.KEY_TOKEN, token).apply()
        lock.withLock { saved.signalAll() }
    }

    /**
     * Asks the phone for a newer token and blocks until one arrives, returning null
     * on timeout (phone unreachable, signed out, or Data Layer not connected).
     */
    fun requestFresh(timeoutMs: Long = 8_000): String? {
        val previous = cached()
        val nodes = runCatching {
            Tasks.await(Wearable.getNodeClient(context).connectedNodes, 5, TimeUnit.SECONDS)
        }.getOrNull().orEmpty()
        if (nodes.isEmpty()) return null

        val messageClient = Wearable.getMessageClient(context)
        // Broadcast rather than pick a node: only the paired phone runs the companion,
        // and a watch can legitimately see more than one connected node.
        nodes.forEach { node ->
            runCatching {
                Tasks.await(
                    messageClient.sendMessage(node.id, TokenTransfer.REQUEST_PATH, ByteArray(0)),
                    5,
                    TimeUnit.SECONDS,
                )
            }
        }
        return awaitChange(previous, timeoutMs)
    }

    private fun awaitChange(previous: String?, timeoutMs: Long): String? {
        val deadline = System.currentTimeMillis() + timeoutMs
        lock.withLock {
            while (true) {
                val current = cached()
                if (current != null && current != previous) return current
                val remaining = deadline - System.currentTimeMillis()
                if (remaining <= 0) return null
                if (!saved.await(remaining, TimeUnit.MILLISECONDS)) return null
            }
        }
    }
}
