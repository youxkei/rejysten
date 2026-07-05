---
name: trace-investigation
description: Investigate performance problems in rejysten (app feels slow, an operation was unresponsive, a keypress/action "didn't work", intermittent freezes) using the OpenTelemetry traces sent to Honeycomb. Use whenever the user reports slowness, jank, lag, a delayed/dropped interaction, or asks to look at traces/spans/latency. Drives the Honeycomb MCP tools against the `rejysten3` environment.
---

# Trace investigation (rejysten → Honeycomb)

The app is instrumented with OpenTelemetry (facade in `src/telemetry`, see the `project-telemetry`
memory). Spans go to Honeycomb via a Cloudflare Pages proxy. This skill is how you turn a vague
"it's slow / it didn't work" report into a span-backed root cause.

## Workspace facts

- Team: `youxkei`. Environment slug: **`rejysten3`**. Dataset slug: **`rejysten3`** (single dataset).
- Query the Honeycomb MCP tools (fetch schemas via ToolSearch `select:mcp__honeycomb__...` first):
  `get_workspace_context` → `list_spans` → `get_span_details` → `run_query` → `get_trace`.
- Each row is one **span**. `duration_ms` is the column for latency. `session.id` groups one browser
  session; `device.touch` / `device.pixel_ratio` / `device.viewport_*` distinguish mobile vs desktop;
  `device.user_agent` gives the browser build.
- Timestamps in tests are mocked, but **span durations use real wall-clock time** — trust them.

## Workflow

1. **Orient** — `get_workspace_context` (confirms env/time), then `list_spans` on `rejysten3` with a
   wide `time_range` (`7d`/`30d`) to see the span landscape ranked by count.
2. **Find the slow operation** — `run_query` breaking down by `name`, filtered to
   `name starts-with "action:"`, with `COUNT`, `P50`, `P95`, `P99`, `MAX(duration_ms)`. **Read the gap
   between P50 and MAX**, not just P95 — the failures worth chasing are often intermittent tail latency
   (P50 fine, MAX orders of magnitude larger), which a healthy P95 hides.
3. **Get a real bad trace** — `run_query` for the offending `name` with `duration_ms > <threshold>`
   and `include_samples: true` (⚠ `include_samples` is a **top-level** arg, NOT inside `query_spec`).
   Grab a `trace.trace_id` from the samples.
4. **Open the waterfall** — `get_trace` with that id, `view_mode: "full"`, `show_events: true`. Then
   **decompose the root span's duration** into the child span categories below.
5. **Attribute the time** — `run_query` filtered to `trace.trace_id = <id>`, breakdown by `name`,
   `COUNT` + `MAX` + `SUM(duration_ms)`. The name with `SUM ≈ root duration` is where the time went.
6. **One-off or systemic?** — re-run step 5's key span across `30d`, broken down by `session.id`
   (count of slow instances per session). Many sessions = systemic bug; one session = fluke/network.
   Correlate `MAX` over time with a growing dataset to catch "gets slower as data accumulates".

## Span taxonomy & what each means

| span | meaning | reading |
| --- | --- | --- |
| `action:<area>.<key>` | one user action, a trace root. areas: `panes.lifeLogs`, `components.tree`, `scroll`, `panes.search`, `components.share`, `components.editHistory` | total user-perceived latency of that action |
| `awaitable.queueWait` | time this action sat in the serialized action queue before its body ran | **head-of-line blocking** — if this dominates, the action ahead of it in the queue is the real culprit; go find that one |
| `solid.transitionFlush` | a SolidJS `startTransition` flush (brackets the transition's `.done` promise, see `src/solid/subscribe.ts`) | a long one is usually **awaiting async** (Suspense on a pending resource / snapshot), NOT busy CPU — confirm by the absence of a co-timed `longtask`. On weak devices it can also include real re-render CPU. Cost tends to scale with the number of live subscriptions / re-rendered nodes |
| `overlay.mergeQuery`, `overlay.apply` | local optimistic overlay bookkeeping | cheap (sub-ms); noise |
| `batch.run` / `batch.build` / `batch.recordHistory` | building & recording an optimistic write batch | usually fast (<20 ms) |
| `batch.commitQueueWait` / `batch.serverQueueWait` / `batch.commit` | the **async** server commit pipeline; these end *after* the action root (late children, same trace) | network/Firestore time. Does NOT block the action body — do not blame these for a frozen UI |
| `firestore.getDoc` / `firestore.getDocs` | reads (`app.source` = overlay/cache/server, `app.collection`, `app.doc_id`, `app.doc_count`) | usually <5 ms from overlay/cache; a `server` source is a real round-trip |
| `snapshot.onDocumentSnapshot` / `snapshot.onQuerySnapshot` | Firestore realtime listeners delivering data | frequently the **root** of an expensive `solid.transitionFlush` (background data sync causing a big re-render) |
| `longtask` | main-thread block >50 ms (`app.duration_ms`); attached to the current action span if one is running | secondary jank, more frequent on mobile |
| `startup*`, `firestoreInitialized`, `ogp.*` | app boot / link-preview fetches | rarely the interactive-latency culprit |

## Interpretation heuristics

- **Decompose, don't guess.** An `action:*` duration = `awaitable.queueWait` (waiting) + its own body
  (`getDoc` + `batch.*` + `solid.transitionFlush`). Find which one ≈ the total.
- **Why an action "did nothing" then flushed later:** actions are serialized by `awaitable()`, and
  action bodies wrap the clock-release in `await startTransition(...)` (e.g.
  `src/panes/lifeLogs/actions.ts` `saveAndDedentTreeNode`). While one transition flush is stuck, every
  later keypress/Shift+Tab queues (`awaitable.queueWait`) and `firestore.setClock(true)` latches the UI
  to stale values (frozen). When the flush finally settles, the whole queue drains at once. That single
  mechanism produces both "slow" and "the keypress didn't register".
- **transitionFlush that roots itself** (`root.name = solid.transitionFlush`) = triggered by incoming
  data (a snapshot), not a user action. transitionFlush **under** an `action:*` root = that action paid
  the re-render cost inline.
- Split by `device.touch` to see if a symptom is mobile-only.

## Query gotchas (Honeycomb MCP)

- `include_samples` is a **top-level** argument of `run_query`, not a field of `query_spec`.
- Relational prefixes (`root.`, `parent.`, `child.`, `any.`) work in `filters` and `breakdowns`, but a
  relational field **cannot be a breakdown while a calculation has per-calc `filters`** (errors out).
  Split into two queries instead.
- Formula expressions can't reference dotted column names (`$app.mutation_count` fails). Alias via a
  named `COUNT`/calc, or just read the value from `get_trace`/`get_span_details`.
- `list_spans` / `get_span_details` answer "what exists / what attributes" faster than `run_query`;
  reach for `run_query` only for calculations, distributions, or time-over-time comparisons.
