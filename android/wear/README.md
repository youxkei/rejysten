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

The ID-token hand-off is wired: `TokenStore` holds the token the paired phone
publishes over the Wear Data Layer (`TokenListenerService` receives it) and asks for
a fresher one on demand, and `LifeLogClient` retries a 401 once against it. Verified
between a phone and a Wear emulator — see `../../docs/wear-os-next-steps.md`.

**The watch APK deliberately carries the phone's `applicationId`
(`com.rejysten.mobile`)**: the Data Layer only connects apps whose applicationId and
signature match, and with two different ids the DataItem never arrives and no error
is logged. The Kotlin namespace stays `com.rejysten.wear`.

Still missing before it is usable on a watch: a switch-candidate picker UI, and a
real `baseUrl` (the endpoints are not deployed yet, so Start/Stop cannot succeed).

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
| `GET /api/lifelog/current` | — | `{ok:true, current:{id,text,startAt}\|null}` | 401 |

- **start**: begins a new entry; startAt chains from the last closed entry's endAt (or now).
- **stop**: closes the open entry at `now`.
- **switch**: stops the open entry (if any) and starts a new one carrying `sourceId`'s text — one commit.
- **switch-candidates**: recent closed, non-empty entries deduped by text (newest kept); pick a `sourceId` from these. Ordering is recency of the last occurrence, nothing else — no frequency or time-of-day weighting — over a scan of the 100 most recent entries, which in production spans roughly two days.
- **current**: the entry in progress, or `null` when the newest one is already closed. `text` is empty for an entry started from the watch, since only a switch gives one its text. `startAt` is ISO-8601.

## Wiring the ID token (login is on the phone)

The watch is **not** signed into Firebase. Login happens on the paired phone
(`mobile/`): it signs in with Firebase Auth, and delivers a fresh ID token to the
watch over the Wear Data Layer (`MessageClient`/`DataClient`, `play-services-wearable`).
So `idTokenProvider: (forceRefresh: Boolean) -> String?` reads the phone-delivered
token from `TokenStore` rather than calling `FirebaseAuth` on the watch, and returns
null when the phone has never delivered one (`LifeLogClient` then reports
`Outcome.Unauthenticated` without issuing a request).

How the two halves work:

- **Delivery:** the phone publishes the token as a `DataClient` item at `/id-token`
  (retained, so a watch that was asleep still gets the latest one). `TokenStore`
  persists it, so a cold start does not have to wait on the Data Layer.
- **Refresh:** tokens expire after ~1h and watch use is sporadic, so `TokenStore`
  can send `/request-id-token` to the phone, which mints a fresh token and
  re-publishes it. `LifeLogClient` drives this on a 401 and retries once — but only
  if the refreshed token actually differs, since retrying an unchanged one just
  fails again.
- **Off the main thread:** the calls block (and so does the refresh wait), so invoke
  from a coroutine: `withContext(Dispatchers.IO) { client.start() }`.

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
