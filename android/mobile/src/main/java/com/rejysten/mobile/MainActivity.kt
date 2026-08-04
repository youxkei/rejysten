package com.rejysten.mobile

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.launch

/**
 * Companion phone app: signs into Firebase with Google and surfaces the ID token.
 *
 * The UI is a deliberately bare test harness for the auth flow ([GoogleSignInController]);
 * publishing it to the watch over the Wear Data Layer ([TokenSync]). The token is
 * shown by length/prefix only, never in full.
 */
class MainActivity : ComponentActivity() {
    private lateinit var controller: GoogleSignInController
    private lateinit var tokenSync: TokenSync
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        controller = GoogleSignInController(getString(R.string.default_web_client_id))
        tokenSync = TokenSync(applicationContext, controller)

        status = TextView(this)
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (16 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad, pad, pad)
            addView(status)
            addView(Button(this@MainActivity).apply {
                text = "Sign in with Google"
                setOnClickListener { signIn() }
            })
            addView(Button(this@MainActivity).apply {
                text = "Show ID token"
                setOnClickListener { showToken() }
            })
            addView(Button(this@MainActivity).apply {
                text = "Push token to watch"
                setOnClickListener { pushToken() }
            })
            addView(Button(this@MainActivity).apply {
                text = "Sign out"
                setOnClickListener {
                    controller.signOut()
                    render()
                }
            })
        }
        // targetSdk 36 forces edge-to-edge, so an unpadded root draws under the
        // status/navigation bars; inset it instead of opting out of edge-to-edge.
        val root = ScrollView(this).apply { addView(content) }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.updatePadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(root)
        render()
    }

    private fun render() {
        val user = controller.currentUser
        status.text = if (user == null) "signed out" else "signed in: ${describe(user)}"
    }

    private fun signIn() {
        status.text = "signing in…"
        lifecycleScope.launch {
            status.text = when (val result = controller.signIn(this@MainActivity)) {
                is GoogleSignInController.SignInResult.Success -> {
                    // Push immediately: the watch cannot act until it holds a token, and
                    // the user has no reason to open the phone app again just for that.
                    val pushed = runCatching { tokenSync.push() }.getOrDefault(false)
                    "signed in: ${describe(result.user)}${if (pushed) " (token pushed)" else " (push failed)"}"
                }
                is GoogleSignInController.SignInResult.Failure -> "sign-in failed: ${result.message}"
            }
        }
    }

    // The uid is shown because firestore.rules gates on one hard-coded uid: a phone
    // signed into the wrong Google account authenticates fine yet is denied every doc.
    private fun describe(user: FirebaseUser): String = "${user.email ?: "(no email)"} uid=${user.uid}"

    private fun pushToken() {
        status.text = "pushing…"
        lifecycleScope.launch {
            status.text = try {
                if (tokenSync.push()) "pushed token to watch" else "not signed in"
            } catch (t: Throwable) {
                "push failed: ${t.message}"
            }
        }
    }

    private fun showToken() {
        lifecycleScope.launch {
            val token = controller.freshIdToken()
            status.text =
                if (token == null) "no token (signed out)"
                else "token len=${token.length}, head=${token.take(12)}…"
        }
    }
}
