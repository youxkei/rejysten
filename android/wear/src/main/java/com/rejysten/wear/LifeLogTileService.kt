package com.rejysten.wear

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
 * The tile reached by swiping from the watch face: what is running, how long it has
 * run, and the three things worth doing about it without opening an app.
 *
 * A tile cannot scroll, so the switch candidates are paged rather than listed. The
 * whole flow stays in the tile: a click carries [ACTION] in the tile's state, this
 * service acts on it and returns the layout that results, so picking a source never
 * leaves the surface the wearer swiped to.
 */
class LifeLogTileService : TileService() {
    private val worker = Executors.newSingleThreadExecutor()

    override fun onTileRequest(request: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
        CallbackToFutureAdapter.getFuture { completer ->
            worker.execute {
                completer.set(
                    runCatching { buildTile(request) }
                        .onFailure { Log.w(TAG, "building the tile failed", it) }
                        .getOrElse { tileOf(message(it.message ?: "error")) },
                )
            }
            "lifelog tile"
        }

    override fun onTileResourcesRequest(
        request: RequestBuilders.ResourcesRequest,
    ): ListenableFuture<ResourceBuilders.Resources> =
        CallbackToFutureAdapter.getFuture { completer ->
            completer.set(ResourceBuilders.Resources.Builder().setVersion(RESOURCES_VERSION).build())
            "lifelog tile resources"
        }

    private fun buildTile(request: RequestBuilders.TileRequest): TileBuilders.Tile {
        val store = TokenStore.get(this)
        val client = LifeLogClient(
            baseUrl = BuildConfig.BASE_URL,
            idTokenProvider = { forceRefresh ->
                if (forceRefresh) store.requestFresh() else store.cached() ?: store.requestFresh()
            },
        )

        return when (val action = request.currentState.keyToValueMapping[ACTION]?.stringValue ?: MAIN) {
            MAIN -> tileOf(mainLayout(client.current()))
            START -> {
                client.start()
                tileOf(mainLayout(client.current()))
            }
            STOP -> {
                client.stop()
                tileOf(mainLayout(client.current()))
            }
            else ->
                when {
                    action.startsWith(PICK) -> tileOf(pickLayout(client.switchCandidates(), page(action)))
                    action.startsWith(SWITCH) -> {
                        client.switch(action.removePrefix(SWITCH))
                        tileOf(mainLayout(client.current()))
                    }
                    else -> tileOf(mainLayout(client.current()))
                }
        }
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

    private fun mainLayout(state: LifeLogClient.CurrentState): LayoutElementBuilders.LayoutElement {
        val heading = when (state) {
            is LifeLogClient.CurrentState.Loaded -> describeCurrentState(state, Instant.now())
            is LifeLogClient.CurrentState.Rejected -> "? ${state.status}"
            LifeLogClient.CurrentState.Unauthenticated -> "? no token"
        }
        val running = state is LifeLogClient.CurrentState.Loaded && state.current != null

        return column(
            text(heading),
            row(
                if (running) button("Stop", STOP) else button("Start", START),
                button("Switch", "$PICK0"),
            ),
        )
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
            *shown.map { button(it.text, "$SWITCH${it.id}") }.toTypedArray(),
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
    private fun button(label: String, action: String): LayoutElementBuilders.LayoutElement =
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
        const val MAIN = "main"
        const val START = "start"
        const val STOP = "stop"
        const val PICK = "pick:"
        const val PICK0 = "pick:0"
        const val SWITCH = "switch:"
    }
}
