# Wear OS lifeLog client

Thin HTTPS client for operating lifeLogs from the watch: **start / stop / switch**
(and listing switch candidates). It talks to the Cloudflare Pages Functions in
`functions/api/lifelog/*`, which assemble the Firestore write contract. The watch
carries **zero** contract logic — see `docs/external-write-path-refactoring.md`.

## Status

This is now a real Gradle module — `LifeLogClient.kt` plus a Compose-for-Wear
`MainActivity` (Start/Stop skeleton) — that builds via the Nix toolchain in
`../` (`gradle :wear:assembleDebug`, verified green). See `../README.md` for the
toolchain and version pins.

Still missing before it is usable on a watch: the ID-token hand-off (the watch is
not signed in — the paired phone mints the Firebase ID token and delivers it over
the Wear Data Layer; wire that into `idTokenProvider`) and a switch-candidate picker
UI. (The build → install → launch loop on a Wear OS emulator is already verified.)
The `mobile/` module is where the phone's Firebase Auth / Google Sign-In will live.

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

## Wiring the ID token (login is on the phone)

The watch is **not** signed into Firebase. Login happens on the paired phone
(`mobile/`): it signs in with Firebase Auth, and delivers a fresh ID token to the
watch over the Wear Data Layer (`MessageClient`/`DataClient`, `play-services-wearable`).
So `idTokenProvider: () -> String` must return the phone-delivered token from a
local cache, not call `FirebaseAuth` on the watch.

Two things this implies, still to build:

- **Token refresh:** Firebase ID tokens expire after ~1h and watch use is sporadic,
  so the phone must re-push (on wake / periodically) and/or the watch must request a
  fresh one on demand. `LifeLogClient` currently returns `Rejected(401)` without
  retry — add a "on 401 → refresh token → retry once" path here.
- **Off the main thread:** the calls block, so invoke from a coroutine:
  `withContext(Dispatchers.IO) { client.start() }` (see `MainActivity.kt`).

`baseUrl` is the Cloudflare Pages deployment of `functions/api/lifelog/*`.

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
