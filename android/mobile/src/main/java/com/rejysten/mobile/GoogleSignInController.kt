package com.rejysten.mobile

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.tasks.await

/**
 * Signs the companion phone into the same Firebase project the Web app uses, so
 * the phone can mint Firebase ID tokens and hand them to the watch over the Wear
 * Data Layer.
 *
 * Flow: Credential Manager returns a Google ID token -> exchanged for a Firebase
 * credential via [GoogleAuthProvider] -> [FirebaseAuth.signInWithCredential]. The
 * resulting [FirebaseUser] yields the short-lived ID token the endpoints expect
 * as `Authorization: Bearer <idToken>`.
 *
 * [serverClientId] is the Web (client_type 3) OAuth client id; pass
 * `context.getString(R.string.default_web_client_id)`, which the google-services
 * plugin generates from google-services.json.
 */
class GoogleSignInController(
    private val serverClientId: String,
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
) {
    sealed interface SignInResult {
        data class Success(val user: FirebaseUser) : SignInResult
        data class Failure(val message: String) : SignInResult
    }

    val currentUser: FirebaseUser?
        get() = auth.currentUser

    suspend fun signIn(activityContext: Context): SignInResult {
        // filterByAuthorizedAccounts=false so first-run offers every Google account,
        // not only ones already linked to this app; skip the authorized-first probe
        // (it would need a NoCredentialException retry) for a simpler single call.
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        val idToken = try {
            val response = CredentialManager.create(activityContext).getCredential(activityContext, request)
            val credential = response.credential
            if (
                credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                GoogleIdTokenCredential.createFrom(credential.data).idToken
            } else {
                return SignInResult.Failure("unexpected credential type: ${credential.type}")
            }
        } catch (e: GetCredentialException) {
            return SignInResult.Failure("credential manager: ${e.message}")
        } catch (e: GoogleIdTokenParsingException) {
            return SignInResult.Failure("google id token parse: ${e.message}")
        }

        return try {
            val firebaseCredential = GoogleAuthProvider.getCredential(idToken, null)
            val user = auth.signInWithCredential(firebaseCredential).await().user
                ?: return SignInResult.Failure("firebase returned no user")
            SignInResult.Success(user)
        } catch (t: Throwable) {
            SignInResult.Failure("firebase sign-in: ${t.message}")
        }
    }

    /**
     * The Firebase ID token for the signed-in user, or null if signed out. This is
     * the value pushed to the watch. Tokens live ~1h; pass forceRefresh when the
     * cached one is stale (e.g. after the watch reports 401).
     */
    suspend fun freshIdToken(forceRefresh: Boolean = false): String? {
        val user = auth.currentUser ?: return null
        return user.getIdToken(forceRefresh).await().token
    }

    fun signOut() = auth.signOut()
}
