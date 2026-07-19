# Wear OS lifeLog client

Thin HTTPS client for operating lifeLogs from the watch: **start / stop / switch**
(and listing switch candidates). It talks to the Cloudflare Pages Functions in
`functions/api/lifelog/*`, which assemble the Firestore write contract. The watch
carries **zero** contract logic — see `docs/external-write-path-refactoring.md`.

## Status

`LifeLogClient.kt` is a self-contained client class, but **this repo has no
Android/Gradle project and no Android toolchain**, so it is not built or tested
here. To ship it you need a Wear OS app project (Gradle + Compose for Wear),
a Firebase `google-services.json`, and Google Sign-In wired to the same Google
account (uid) the Web app uses. Drop `LifeLogClient.kt` into that project's
source set (adjust the package) and wire the token provider as below.

## Endpoints

All requests require `Authorization: Bearer <Firebase ID token>`. Firestore
evaluates Security Rules against that token, so no service-account credential is
introduced. Responses are JSON.

| Method & path | Body | Success (200) | Non-success |
|---|---|---|---|
| `POST /api/lifelog/start` | `{}` | `{ok:true, id}` | 401, 503 |
| `POST /api/lifelog/stop` | `{}` | `{ok:true, id}` | 409 `no open entry`, 401, 503 |
| `POST /api/lifelog/switch` | `{sourceId}` | `{ok:true, id, stoppedId}` | 400 `bad request`, 404 `source not found`, 401, 503 |
| `GET /api/lifelog/switch-candidates` | — | `{ok:true, candidates:[{id,text}]}` | 401 |

- **start**: begins a new entry; startAt chains from the last closed entry's endAt (or now).
- **stop**: closes the open entry at `now`.
- **switch**: stops the open entry (if any) and starts a new one carrying `sourceId`'s text — one commit.
- **switch-candidates**: recent closed, non-empty entries deduped by text (newest kept); pick a `sourceId` from these.

## Wiring the ID token

`LifeLogClient` takes an `idTokenProvider: () -> String`. Wire it to FirebaseAuth
(the call blocks, so the whole client must run off the main thread):

```kotlin
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

val client = LifeLogClient(
    baseUrl = "https://<your-pages-domain>",
    idTokenProvider = {
        val user = FirebaseAuth.getInstance().currentUser
            ?: throw IllegalStateException("not signed in")
        Tasks.await(user.getIdToken(false)).token
            ?: throw IllegalStateException("no id token")
    },
)

// From a coroutine:
val outcome = withContext(Dispatchers.IO) { client.start() }
```

## CORS

The functions set no CORS headers. If the watch calls them from a different
origin (rather than the same Cloudflare zone), add an `onRequestOptions`
preflight handler alongside the endpoints. A native `HttpURLConnection` client
(as here) is not subject to browser CORS, so this only matters for a WebView/JS
client.

## Server configuration

The functions read `FIRESTORE_PROJECT_ID` (dev = `rejysten3-dev`) from the
Cloudflare Pages environment, and optionally `FIRESTORE_EMULATOR_HOST` to target
the emulator in tests. Set `FIRESTORE_PROJECT_ID` in the Pages dashboard for prod.
