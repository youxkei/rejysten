package com.rejysten.wear

import android.content.Context
import android.util.Log
import androidx.concurrent.futures.CallbackToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders
import androidx.wear.protolayout.DimensionBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.StateBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.TypeBuilders
import androidx.wear.protolayout.expression.AppDataKey
import androidx.wear.protolayout.expression.DynamicBuilders
import androidx.wear.protolayout.expression.DynamicDataBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture
import java.time.Duration
import java.time.Instant
import java.util.concurrent.Executors

/**
 * What the tile last knew, so it can draw before it asks.
 *
 * A tile is expected to appear at once, and asking the endpoint takes a round trip --
 * two, when the token has to be refreshed through the phone first. Rendering the last
 * known state and correcting it afterwards is the difference between a tile that
 * appears and one that arrives.
 */
private class LastKnown(context: Context) {
    private val prefs = context.getSharedPreferences("tile-current", Context.MODE_PRIVATE)

    fun load(): LifeLogClient.CurrentState? = currentStateFromKey(prefs.getString(STATE, null))

    fun save(state: LifeLogClient.CurrentState) {
        prefs.edit().putString(STATE, currentStateKey(state)).apply()
    }

    /**
     * Whether this state is the one already stored, and so already on screen.
     *
     * Everything is stored, failures included, and the comparison is against the same
     * encoding. Both matter: a failure that were dropped instead would read as "not
     * what is drawn" every time it recurred, and asking for a redraw over it would
     * bring this method straight back with the same answer -- which is the loop that
     * cost twenty seconds a turn until it was written this way.
     */
    fun alreadyShows(state: LifeLogClient.CurrentState): Boolean = prefs.getString(STATE, null) == currentStateKey(state)

    private companion object {
        const val STATE = "state"
    }
}

// A tab, written as an escape so the source carries no control character of its own. An
// activity's name would have to contain one to confuse this, and the cost if it did is a
// redraw that was not needed.
private const val KEY_SEP = "\t"

/**
 * The state as one comparable string, failures included.
 *
 * Every state has to be representable, the ones not worth drawing twice most of all: a
 * failure left out of this encoding never equals what was stored, so the tile asks to be
 * redrawn over it, comes back with the same failure, and asks again -- which it did, once
 * every twenty seconds, until failures were encoded here too.
 *
 * The entry's age is deliberately absent. The rendered duration counts by itself, so an
 * unchanged entry needs no redraw however long it has been running.
 */
internal fun currentStateKey(state: LifeLogClient.CurrentState): String =
    when (state) {
        is LifeLogClient.CurrentState.Loaded ->
            state.current?.let { "running$KEY_SEP${it.id}$KEY_SEP${it.text}$KEY_SEP${it.startAt}" } ?: "idle"
        is LifeLogClient.CurrentState.Rejected -> "error$KEY_SEP${state.status}$KEY_SEP${state.reason}"
        LifeLogClient.CurrentState.Unauthenticated -> "noToken"
    }

/** The inverse of [currentStateKey]; null when nothing has been stored yet. */
internal fun currentStateFromKey(key: String?): LifeLogClient.CurrentState? {
    val parts = key?.split(KEY_SEP) ?: return null
    return when (parts.first()) {
        "running" ->
            if (parts.size < 4) {
                null
            } else {
                LifeLogClient.CurrentState.Loaded(LifeLogClient.Current(parts[1], parts[2], parts[3]))
            }
        "idle" -> LifeLogClient.CurrentState.Loaded(null)
        "error" ->
            if (parts.size < 3) null else LifeLogClient.CurrentState.Rejected(parts[1].toIntOrNull() ?: 0, parts[2])
        "noToken" -> LifeLogClient.CurrentState.Unauthenticated
        else -> null
    }
}

/**
 * The tile reached by swiping from the watch face: what is running, how long it has run,
 * and the three things worth doing about it without opening an app.
 *
 * A tile cannot scroll, so the switch candidates are paged rather than listed. The whole
 * flow stays in the tile: a click carries [ACTION] in the tile's state, this service acts
 * on it and returns the layout that results, so picking a source never leaves the surface
 * the wearer swiped to.
 */
class LifeLogTileService : TileService() {
    private val worker = Executors.newSingleThreadExecutor()

    /**
     * Answers from what is already known and reconciles afterwards.
     *
     * Only picking candidates waits on the endpoint, because a list cannot be guessed.
     * Everything else is drawn from the last known state -- or, for a tap, from what
     * that tap is about to make true -- and the request that follows corrects it
     * through requestUpdate if the endpoint disagrees.
     */
    override fun onTileRequest(request: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
        CallbackToFutureAdapter.getFuture { completer ->
            val action = request.currentState.keyToValueMapping[ACTION]?.stringValue ?: MAIN
            val label = request.currentState.keyToValueMapping[LABEL]?.stringValue.orEmpty()
            val lastKnown = LastKnown(this)
            // A tile that read the endpoint and agreed with what it had drawn used to
            // pass without a trace, which makes "the tile is stale" and "the tile was
            // never asked" the same log -- and they have opposite causes.
            Log.i(TAG, "asked for $action")

            if (action.startsWith(PICK)) {
                worker.execute {
                    completer.set(
                        runCatching { tileOf(pickLayout(client().switchCandidates(), page(action))) }
                            .onFailure { Log.w(TAG, "listing candidates failed", it) }
                            .getOrElse { tileOf(message(it.message ?: "error")) },
                    )
                }
            } else {
                completer.set(tileOf(mainLayout(expected(action, label) ?: lastKnown.load())))
                worker.execute { perform(action, lastKnown) }
            }
            "lifelog tile"
        }

    /** What the tap is about to make true, so the tile can show it before it is. */
    private fun expected(action: String, label: String): LifeLogClient.CurrentState? =
        when {
            action == START -> running(text = "")
            action == STOP -> LifeLogClient.CurrentState.Loaded(null)
            action.startsWith(SWITCH) -> running(text = label)
            else -> null
        }

    private fun running(text: String): LifeLogClient.CurrentState =
        LifeLogClient.CurrentState.Loaded(LifeLogClient.Current("", text, Instant.now().toString()))

    /**
     * Carries out the tap, then reads what is actually running and asks for a redraw
     * when it differs from what was drawn. Comparing before asking is what keeps this
     * from looping: an update re-enters onTileRequest, which lands here again.
     */
    private fun perform(action: String, lastKnown: LastKnown) {
        val client = client()
        val outcome = runCatching {
            when {
                action == START -> client.start()
                action == STOP -> client.stop()
                action.startsWith(SWITCH) -> client.switch(action.removePrefix(SWITCH))
                else -> null
            }
        }
        outcome.onFailure { Log.w(TAG, "the tap failed", it) }
        outcome.getOrNull()?.let { Log.i(TAG, "$action: ${describeOutcome(it)}") }

        val actual = runCatching { client.current() }
            .onFailure { Log.w(TAG, "reading the current entry failed", it) }
            .getOrNull()
            ?: return
        // Asked before it is stored, so a state already drawn does not ask for itself
        // again. Storing first would make every comparison agree and nothing redraw.
        val redrawNeeded = !lastKnown.alreadyShows(actual)
        lastKnown.save(actual)
        Log.i(TAG, "read ${currentStateKey(actual)}: ${if (redrawNeeded) "redrawing" else "already drawn"}")
        if (redrawNeeded) TileService.getUpdater(this).requestUpdate(LifeLogTileService::class.java)
    }

    private fun client(): LifeLogClient {
        val store = TokenStore.get(this)
        return LifeLogClient(
            baseUrl = BuildConfig.BASE_URL,
            idTokenProvider = { forceRefresh ->
                if (forceRefresh) store.requestFresh() else store.cached() ?: store.requestFresh()
            },
        )
    }

    override fun onTileResourcesRequest(
        request: RequestBuilders.ResourcesRequest,
    ): ListenableFuture<ResourceBuilders.Resources> =
        CallbackToFutureAdapter.getFuture { completer ->
            completer.set(ResourceBuilders.Resources.Builder().setVersion(RESOURCES_VERSION).build())
            "lifelog tile resources"
        }

    private fun tileOf(layout: LayoutElementBuilders.LayoutElement): TileBuilders.Tile =
        TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            // Re-requested about every minute so the elapsed time stays close while the
            // tile is on screen, and so a change made from the Web app shows up.
            .setFreshnessIntervalMillis(Duration.ofMinutes(1).toMillis())
            .setTileTimeline(
                TimelineBuilders.Timeline.Builder()
                    .addTimelineEntry(
                        TimelineBuilders.TimelineEntry.Builder()
                            .setLayout(LayoutElementBuilders.Layout.Builder().setRoot(layout).build())
                            .build(),
                    )
                    .build(),
            )
            .build()

    private fun mainLayout(state: LifeLogClient.CurrentState?): LayoutElementBuilders.LayoutElement {
        val running = (state as? LifeLogClient.CurrentState.Loaded)?.current

        val heading = when {
            running != null -> runningText(running)
            state is LifeLogClient.CurrentState.Loaded -> text("idle")
            state is LifeLogClient.CurrentState.Rejected -> text("? ${state.status}")
            state is LifeLogClient.CurrentState.Unauthenticated -> text("? no token")
            // Nothing known yet: the first request after an install, with the read that
            // will fill this in already on its way.
            else -> text("…")
        }

        return column(
            heading,
            row(
                if (running != null) button("Stop", STOP) else button("Start", START),
                button("Switch", PICK0),
            ),
        )
    }

    /**
     * The running entry and how long it has run, where the duration counts by itself.
     *
     * A tile is built once and then looked at, so a duration rendered as text ages
     * silently -- the elapsed minutes were whatever they had been when the tile was
     * last requested. This is expressed against platform time instead, which the
     * renderer re-evaluates as the clock moves, without waking this service.
     */
    private fun runningText(current: LifeLogClient.Current): LayoutElementBuilders.LayoutElement {
        val label = current.text.ifEmpty { "(untitled)" }
        val startedAt = runCatching { Instant.parse(current.startAt) }.getOrNull()
            ?: return text(label)

        val elapsed = DynamicBuilders.DynamicInstant.withSecondsPrecision(startedAt)
            .durationUntil(DynamicBuilders.DynamicInstant.platformTimeWithSecondsPrecision())
        val hours = elapsed.toIntHours()
        // Under an hour the hours part would read "0h", so the two forms differ rather
        // than one padding the other.
        val duration = DynamicBuilders.DynamicString.onCondition(hours.gt(0))
            .use(
                hours.format()
                    .concat(DynamicBuilders.DynamicString.constant("h"))
                    .concat(elapsed.getMinutesPart().format())
                    .concat(DynamicBuilders.DynamicString.constant("m")),
            )
            .elseUse(
                elapsed.toIntMinutes().format().concat(DynamicBuilders.DynamicString.constant("m")),
            )

        return LayoutElementBuilders.Text.Builder()
            .setText(
                TypeBuilders.StringProp.Builder("$label · ")
                    .setDynamicValue(DynamicBuilders.DynamicString.constant("$label · ").concat(duration))
                    .build(),
            )
            // A dynamic value needs a layout constraint: the renderer sizes the line
            // before it knows what the expression will produce.
            .setLayoutConstraintsForDynamicText(
                TypeBuilders.StringLayoutConstraint.Builder("$label · 00h00m").build(),
            )
            .setMaxLines(1)
            .setOverflow(LayoutElementBuilders.TEXT_OVERFLOW_ELLIPSIZE)
            .build()
    }

    private fun pickLayout(
        candidates: LifeLogClient.CandidateList,
        page: Int,
    ): LayoutElementBuilders.LayoutElement {
        val all = when (candidates) {
            is LifeLogClient.CandidateList.Loaded -> candidates.candidates
            is LifeLogClient.CandidateList.Rejected -> return column(text("? ${candidates.status}"), backRow())
            LifeLogClient.CandidateList.Unauthenticated -> return column(text("? no token"), backRow())
        }
        if (all.isEmpty()) return column(text("nothing to switch to"), backRow())

        val pages = (all.size + PER_PAGE - 1) / PER_PAGE
        val shown = all.drop(page * PER_PAGE).take(PER_PAGE)
        val next = if (pages <= 1) null else "$PICK${(page + 1) % pages}"

        return column(
            // The name travels with the tap so the tile can name what it switched to
            // before the endpoint has been asked; a switch response carries only ids.
            *shown.map { button(it.text, "$SWITCH${it.id}", carries = it.text) }.toTypedArray(),
            backRow(next),
        )
    }

    private fun backRow(next: String? = null): LayoutElementBuilders.LayoutElement =
        row(*listOfNotNull(button("←", MAIN), next?.let { button("▼", it) }).toTypedArray())

    private fun message(text: String): LayoutElementBuilders.LayoutElement = column(text(text))

    // Ellipsised on one line: text that wraps on a round screen loses the ends of the
    // lines it wraps to, and an activity's name can be any length.
    private fun text(value: String): LayoutElementBuilders.LayoutElement =
        LayoutElementBuilders.Text.Builder()
            .setText(value)
            .setMaxLines(1)
            .setOverflow(LayoutElementBuilders.TEXT_OVERFLOW_ELLIPSIZE)
            .build()

    /**
     * The tile's root: the children stacked and centred within an inset that keeps them
     * off the corners. A Column has no vertical alignment of its own -- its children are
     * laid out in order from the top -- so the centring comes from the Box around it,
     * without which the content sits against the top of a round screen and the first
     * line is cut off by it.
     */
    private fun column(vararg children: LayoutElementBuilders.LayoutElement): LayoutElementBuilders.LayoutElement {
        val stack = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        children.forEachIndexed { index, child ->
            if (index > 0) stack.addContent(gap(vertical = true))
            stack.addContent(child)
        }

        return LayoutElementBuilders.Box.Builder()
            .setWidth(DimensionBuilders.expand())
            .setHeight(DimensionBuilders.expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setPadding(
                        ModifiersBuilders.Padding.Builder()
                            .setStart(DimensionBuilders.dp(24f))
                            .setEnd(DimensionBuilders.dp(24f))
                            .setTop(DimensionBuilders.dp(16f))
                            .setBottom(DimensionBuilders.dp(16f))
                            .build(),
                    )
                    .build(),
            )
            .addContent(stack.build())
            .build()
    }

    private fun row(vararg children: LayoutElementBuilders.LayoutElement): LayoutElementBuilders.LayoutElement {
        val builder = LayoutElementBuilders.Row.Builder()
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
        children.forEachIndexed { index, child ->
            if (index > 0) builder.addContent(gap(vertical = false))
            builder.addContent(child)
        }
        return builder.build()
    }

    private fun gap(vertical: Boolean): LayoutElementBuilders.LayoutElement =
        LayoutElementBuilders.Spacer.Builder()
            .apply {
                if (vertical) setHeight(DimensionBuilders.dp(GAP_DP)) else setWidth(DimensionBuilders.dp(GAP_DP))
            }
            .build()

    // A click re-enters onTileRequest carrying the action, which is what keeps the
    // whole flow inside the tile instead of launching the app to finish it.
    private fun button(label: String, action: String, carries: String = ""): LayoutElementBuilders.LayoutElement =
        LayoutElementBuilders.Box.Builder()
            .addContent(text(label))
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setPadding(
                        ModifiersBuilders.Padding.Builder()
                            .setStart(DimensionBuilders.dp(12f))
                            .setEnd(DimensionBuilders.dp(12f))
                            .setTop(DimensionBuilders.dp(8f))
                            .setBottom(DimensionBuilders.dp(8f))
                            .build(),
                    )
                    // Drawn as a shape, not bare text: without it nothing on the tile shows
                    // where a tap lands.
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(ColorBuilders.argb(BUTTON_COLOR))
                            .setCorner(
                                ModifiersBuilders.Corner.Builder()
                                    .setRadius(DimensionBuilders.dp(20f))
                                    .build(),
                            )
                            .build(),
                    )
                    .setClickable(
                        ModifiersBuilders.Clickable.Builder()
                            .setId(action)
                            .setOnClick(
                                ActionBuilders.LoadAction.Builder()
                                    .setRequestState(
                                        StateBuilders.State.Builder()
                                            .addKeyToValueMapping(
                                                ACTION,
                                                DynamicDataBuilders.DynamicDataValue.fromString(action),
                                            )
                                            .addKeyToValueMapping(
                                                LABEL,
                                                DynamicDataBuilders.DynamicDataValue.fromString(carries),
                                            )
                                            .build(),
                                    )
                                    .build(),
                            )
                            .build(),
                    )
                    .build(),
            )
            .build()

    private fun page(action: String): Int = action.removePrefix(PICK).toIntOrNull() ?: 0

    private companion object {
        const val TAG = "RejystenTile"
        const val RESOURCES_VERSION = "1"

        // The tile has no room to scroll, so candidates come a page at a time.
        const val PER_PAGE = 3

        // Wear's surface colour, so a button reads as one against the tile's background.
        const val BUTTON_COLOR = 0xFF3C4043.toInt()
        const val GAP_DP = 6f

        val ACTION: AppDataKey<DynamicBuilders.DynamicString> = AppDataKey("action")
        val LABEL: AppDataKey<DynamicBuilders.DynamicString> = AppDataKey("label")
        const val MAIN = "main"
        const val START = "start"
        const val STOP = "stop"
        const val PICK = "pick:"
        const val PICK0 = "pick:0"
        const val SWITCH = "switch:"
    }
}
