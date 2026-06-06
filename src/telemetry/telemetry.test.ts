import { afterEach, describe, expect, it } from "vitest";

import { awaitable, awaitPendingCallbacks } from "@/awaitableCallback";
import {
  clearFinishedSpansForTest,
  getFinishedSpansForTest,
  initTelemetry,
  resetTelemetryForTest,
} from "@/telemetry/provider";
import {
  addActionEvent,
  beginAction,
  endSpan,
  getCurrentActionSpan,
  lastActionLink,
  offerActionHandoff,
  recordLongTask,
  startSpan,
  SpanStatusCode,
  takeActionHandoff,
  withSpan,
  wrapAction,
} from "@/telemetry/span";
import { addStartupEvent, beginStartup, beginStartupPhase, endStartup } from "@/telemetry/startup";

function findSpan(name: string) {
  const span = getFinishedSpansForTest().find((s) => s.name === name);
  if (!span) throw new Error(`span "${name}" not found`);
  return span;
}

describe("telemetry", () => {
  afterEach(async () => {
    await resetTelemetryForTest();
  });

  it("records an action root span with nested child spans", async () => {
    initTelemetry({ mode: "memory" });

    const handle = beginAction("panes.lifeLogs.saveText", { attributes: { "app.id": "lifelog1" } });
    await handle.runBody(async () => {
      await withSpan("batch.commit", async () => {
        await Promise.resolve();
      });
    });

    const root = findSpan("action:panes.lifeLogs.saveText");
    const child = findSpan("batch.commit");

    expect(root.parentSpanContext).toBeUndefined();
    expect(root.attributes["app.id"]).toBe("lifelog1");
    expect(child.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    expect(child.spanContext().traceId).toBe(root.spanContext().traceId);
  });

  it("makes spans outside an action their own roots", async () => {
    initTelemetry({ mode: "memory" });

    await withSpan("snapshot.onQuerySnapshot", async () => {
      await Promise.resolve();
    });

    expect(findSpan("snapshot.onQuerySnapshot").parentSpanContext).toBeUndefined();
  });

  it("records queue wait as a child of the action root", async () => {
    initTelemetry({ mode: "memory" });

    const handle = beginAction("components.tree.indent");
    const endQueueWait = handle.startQueueWait();
    await Promise.resolve();
    endQueueWait();
    await handle.runBody(() => Promise.resolve());

    const root = findSpan("action:components.tree.indent");
    const queueWait = findSpan("awaitable.queueWait");

    expect(queueWait.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
  });

  it("ends synchronous actions with endSync", () => {
    initTelemetry({ mode: "memory" });

    const handle = beginAction("panes.lifeLogs.navigateNext");
    handle.endSync();

    const root = findSpan("action:panes.lifeLogs.navigateNext");
    expect(root.ended).toBe(true);
  });

  it("ends the span only once even when endSync is called after runBody", async () => {
    initTelemetry({ mode: "memory" });

    const handle = beginAction("panes.lifeLogs.newLifeLog");
    await handle.runBody(() => Promise.resolve());
    handle.endSync();

    expect(getFinishedSpansForTest().filter((s) => s.name === "action:panes.lifeLogs.newLifeLog")).toHaveLength(1);
  });

  it("records errors on the action span and rethrows", async () => {
    initTelemetry({ mode: "memory" });

    const handle = beginAction("panes.lifeLogs.saveText");
    await expect(handle.runBody(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");

    const root = findSpan("action:panes.lifeLogs.saveText");
    expect(root.status.code).toBe(SpanStatusCode.ERROR);
    expect(root.events.some((event) => event.name === "exception")).toBe(true);
  });

  it("records errors on withSpan and rethrows, preserving the synchronous shape", () => {
    initTelemetry({ mode: "memory" });

    expect(() =>
      withSpan("overlay.mergeQuery", () => {
        throw new Error("merge failed");
      }),
    ).toThrow("merge failed");

    const span = findSpan("overlay.mergeQuery");
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("preserves synchronous return values of withSpan", () => {
    initTelemetry({ mode: "memory" });

    const result = withSpan("overlay.mergeQuery", () => 42);

    expect(result).toBe(42);
    expect(findSpan("overlay.mergeQuery").ended).toBe(true);
  });

  it("nests an action begun during another action's body", async () => {
    initTelemetry({ mode: "memory" });

    const outer = beginAction("panes.lifeLogs.outer");
    await outer.runBody(() => {
      const inner = beginAction("panes.lifeLogs.inner");
      inner.endSync();
      return Promise.resolve();
    });

    const outerSpan = findSpan("action:panes.lifeLogs.outer");
    const innerSpan = findSpan("action:panes.lifeLogs.inner");

    expect(innerSpan.parentSpanContext?.spanId).toBe(outerSpan.spanContext().spanId);
  });

  it("restores the previous current action after runBody", async () => {
    initTelemetry({ mode: "memory" });

    const handle = beginAction("panes.lifeLogs.saveText");
    await handle.runBody(() => {
      expect(getCurrentActionSpan()).toBe(handle.span);
      return Promise.resolve();
    });

    expect(getCurrentActionSpan()).toBeUndefined();
  });

  it("adds action events only while an action is running", async () => {
    initTelemetry({ mode: "memory" });

    addActionEvent("ignored");

    const handle = beginAction("panes.lifeLogs.saveText");
    await handle.runBody(() => {
      addActionEvent("commit.enqueued", { "app.batch_id": "batch1" });
      return Promise.resolve();
    });

    const root = findSpan("action:panes.lifeLogs.saveText");
    const event = root.events.find((e) => e.name === "commit.enqueued");
    expect(event?.attributes?.["app.batch_id"]).toBe("batch1");
  });

  it("links detached spans to the most recent action", async () => {
    initTelemetry({ mode: "memory" });

    expect(lastActionLink()).toBeUndefined();

    const handle = beginAction("panes.lifeLogs.saveText");
    await handle.runBody(() => Promise.resolve());

    const link = lastActionLink();
    const span = startSpan("snapshot.onQuerySnapshot", { root: true, links: link ? [link] : [] });
    endSpan(span);

    const root = findSpan("action:panes.lifeLogs.saveText");
    const snapshot = findSpan("snapshot.onQuerySnapshot");

    expect(snapshot.parentSpanContext).toBeUndefined();
    expect(snapshot.links[0]?.context.spanId).toBe(root.spanContext().spanId);
  });

  it("ends detached spans with errors recorded", () => {
    initTelemetry({ mode: "memory" });

    const span = startSpan("batch.commit");
    endSpan(span, new Error("commit failed"));

    const finished = findSpan("batch.commit");
    expect(finished.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("hands an action handle from the registry wrapper to awaitable exactly once", () => {
    initTelemetry({ mode: "memory" });

    const handle = beginAction("panes.lifeLogs.saveText");
    offerActionHandoff(handle);

    expect(takeActionHandoff()).toBe(handle);
    expect(takeActionHandoff()).toBeUndefined();

    handle.endSync();
  });

  it("records long tasks as events on the current action span", async () => {
    initTelemetry({ mode: "memory" });

    const handle = beginAction("panes.lifeLogs.saveText");
    await handle.runBody(() => {
      recordLongTask(Date.now(), 120);
      return Promise.resolve();
    });

    const root = findSpan("action:panes.lifeLogs.saveText");
    const event = root.events.find((e) => e.name === "longtask");
    expect(event?.attributes?.["app.duration_ms"]).toBe(120);
  });

  it("records long tasks outside an action as standalone spans", () => {
    initTelemetry({ mode: "memory" });

    recordLongTask(Date.now() - 200, 200);

    const span = findSpan("longtask");
    expect(span.attributes["app.duration_ms"]).toBe(200);
  });

  it("is a no-op before initTelemetry is called", async () => {
    const handle = beginAction("panes.lifeLogs.saveText");
    const result = await handle.runBody(() => Promise.resolve(42));

    expect(result).toBe(42);
    expect(withSpan("overlay.mergeQuery", () => "sync")).toBe("sync");
    expect(getFinishedSpansForTest()).toHaveLength(0);
  });

  it("ignores a second initTelemetry call", () => {
    initTelemetry({ mode: "memory" });
    initTelemetry({ mode: "console" });

    const handle = beginAction("panes.lifeLogs.saveText");
    handle.endSync();

    expect(getFinishedSpansForTest()).toHaveLength(1);
  });

  it("wrapAction records a span for synchronous actions", () => {
    initTelemetry({ mode: "memory" });

    const action = wrapAction("panes.lifeLogs.navigateNext", (delta: number) => delta + 1);

    expect(action(1)).toBe(2);

    const root = findSpan("action:panes.lifeLogs.navigateNext");
    expect(root.ended).toBe(true);
    expect(root.parentSpanContext).toBeUndefined();
  });

  it("wrapAction records synchronous errors and rethrows", () => {
    initTelemetry({ mode: "memory" });

    const action = wrapAction("panes.lifeLogs.navigateNext", () => {
      throw new Error("sync failure");
    });

    expect(() => action()).toThrow("sync failure");
    expect(findSpan("action:panes.lifeLogs.navigateNext").status.code).toBe(SpanStatusCode.ERROR);
  });

  it("wrapAction hands the span to awaitable and ends it when the body settles", async () => {
    initTelemetry({ mode: "memory" });

    let bodyRan = false;
    const action = wrapAction(
      "panes.lifeLogs.setStartAtNow",
      awaitable(async function setStartAtNow() {
        await Promise.resolve();
        bodyRan = true;
      }),
    );

    action();
    expect(getFinishedSpansForTest()).toHaveLength(0);
    await awaitPendingCallbacks();

    expect(bodyRan).toBe(true);
    const root = findSpan("action:panes.lifeLogs.setStartAtNow");
    expect(root.ended).toBe(true);
    expect(root.parentSpanContext).toBeUndefined();
  });

  it("records queue wait when an awaitable action waits for a prior callback", async () => {
    initTelemetry({ mode: "memory" });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = awaitable(async function blocker() {
      await gate;
    });
    const action = wrapAction(
      "panes.lifeLogs.saveText",
      awaitable(async function saveText() {
        await Promise.resolve();
      }),
    );

    blocker();
    action();
    release();
    await awaitPendingCallbacks();

    const root = findSpan("action:panes.lifeLogs.saveText");
    const queueWait = findSpan("awaitable.queueWait");
    expect(queueWait.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
  });

  it("records errors from awaitable action bodies on the span", async () => {
    initTelemetry({ mode: "memory" });

    const action = wrapAction(
      "panes.lifeLogs.saveText",
      awaitable(async function saveText() {
        await Promise.resolve();
        throw new Error("body failure");
      }),
    );

    action();
    await awaitPendingCallbacks();

    expect(findSpan("action:panes.lifeLogs.saveText").status.code).toBe(SpanStatusCode.ERROR);
  });

  it("wrapAction parents data-layer spans created inside the action body", async () => {
    initTelemetry({ mode: "memory" });

    const action = wrapAction(
      "panes.lifeLogs.saveText",
      awaitable(async function saveText() {
        await withSpan("firestore.getDoc", () => Promise.resolve());
      }),
    );

    action();
    await awaitPendingCallbacks();

    const root = findSpan("action:panes.lifeLogs.saveText");
    const child = findSpan("firestore.getDoc");
    expect(child.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
  });

  it("records the startup trace with phase children and events", () => {
    initTelemetry({ mode: "memory" });

    beginStartup();
    const endPhase = beginStartupPhase("authResolve");
    addStartupEvent("firestoreInitialized");
    endPhase();
    endStartup();

    const startup = findSpan("startup");
    const phase = findSpan("startup.authResolve");

    expect(startup.parentSpanContext).toBeUndefined();
    expect(phase.parentSpanContext?.spanId).toBe(startup.spanContext().spanId);
    expect(startup.events.some((event) => event.name === "firestoreInitialized")).toBe(true);
  });

  it("runs startup phases at most once and ends startup idempotently", () => {
    initTelemetry({ mode: "memory" });

    beginStartup();
    beginStartup();
    const endFirst = beginStartupPhase("authResolve");
    const endSecond = beginStartupPhase("authResolve");
    endFirst();
    endFirst();
    endSecond();
    endStartup();
    endStartup();

    expect(getFinishedSpansForTest().filter((s) => s.name === "startup.authResolve")).toHaveLength(1);
    expect(getFinishedSpansForTest().filter((s) => s.name === "startup")).toHaveLength(1);
  });

  it("makes startup helpers no-ops before beginStartup", () => {
    initTelemetry({ mode: "memory" });

    const endPhase = beginStartupPhase("authResolve");
    endPhase();
    addStartupEvent("ignored");
    endStartup();

    expect(getFinishedSpansForTest()).toHaveLength(0);
  });

  it("clears recorded spans between assertions", () => {
    initTelemetry({ mode: "memory" });

    beginAction("panes.lifeLogs.saveText").endSync();
    expect(getFinishedSpansForTest()).toHaveLength(1);

    clearFinishedSpansForTest();
    expect(getFinishedSpansForTest()).toHaveLength(0);
  });
});
