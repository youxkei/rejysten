import { cleanup } from "@solidjs/testing-library";
import { Timestamp } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { awaitPendingCallbacks } from "@/awaitableCallback";
import { baseTime, setupLifeLogsTest } from "@/panes/lifeLogs/test";
import { type FirestoreService } from "@/services/firebase/firestore";
import { waitForPendingCommitsForTest } from "@/services/firebase/firestore/batch";
import { styles } from "@/styles.css";
import { getFinishedSpansForTest, initTelemetry, resetTelemetryForTest } from "@/telemetry/provider";
import { beginStartup } from "@/telemetry/startup";
import { acquireEmulator, createTestWithDb, releaseEmulator } from "@/test";

vi.mock(import("@/date"), async () => {
  return {
    NewDate: () => baseTime,
    DateNow: () => baseTime.getTime(),
    TimestampNow: () => Timestamp.fromDate(baseTime),
  };
});

let emulatorPort: number;
const it = createTestWithDb(() => emulatorPort);

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

let firestoreForCleanup: FirestoreService | undefined;

async function waitForCurrentPendingCommits() {
  if (firestoreForCleanup) {
    await waitForPendingCommitsForTest({ service: firestoreForCleanup });
  }
}

afterEach(async () => {
  await awaitPendingCallbacks();
  await waitForCurrentPendingCommits();
  cleanup();
  await awaitPendingCallbacks();
  await waitForCurrentPendingCommits();
  firestoreForCleanup = undefined;
  await resetTelemetryForTest();
});

describe("lifeLogs action telemetry", () => {
  function findRootSpan(name: string) {
    const span = getFinishedSpansForTest().find((s) => s.name === name);
    if (!span) throw new Error(`span "${name}" not found`);
    return span;
  }

  it("records root spans for keyboard-triggered actions", async ({ db, task }) => {
    initTelemetry({ mode: "memory" });

    const { result, firestore } = await setupLifeLogsTest(task.id, db);
    firestoreForCleanup = firestore;

    await result.findByText("first lifelog");

    // Synchronous action
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    // Awaitable action with a Firestore write
    await userEvent.keyboard("{s}");
    await awaitPendingCallbacks();
    await waitForPendingCommitsForTest({ service: firestore });

    const navigateNext = findRootSpan("action:panes.lifeLogs.navigateNext");
    expect(navigateNext.ended).toBe(true);
    expect(navigateNext.parentSpanContext).toBeUndefined();

    const setStartAtNow = findRootSpan("action:panes.lifeLogs.setStartAtNow");
    expect(setStartAtNow.ended).toBe(true);
    expect(setStartAtNow.parentSpanContext).toBeUndefined();
  });

  it("records the batch span tree under a write action", async ({ db, task }) => {
    initTelemetry({ mode: "memory" });

    // $log3 has startAt: noneTimestamp, so setStartAtNow actually writes
    const { result, firestore } = await setupLifeLogsTest(task.id, db, { initialSelectedId: "$log3" });
    firestoreForCleanup = firestore;

    await result.findByText("third lifelog");

    await userEvent.keyboard("{s}");
    await awaitPendingCallbacks();
    await waitForPendingCommitsForTest({ service: firestore });

    const action = findRootSpan("action:panes.lifeLogs.setStartAtNow");
    const run = findRootSpan("batch.run");
    const build = findRootSpan("batch.build");
    const commitQueueWait = findRootSpan("batch.commitQueueWait");
    const recordHistory = findRootSpan("batch.recordHistory");
    const overlayApply = findRootSpan("overlay.apply");
    const serverQueueWait = findRootSpan("batch.serverQueueWait");
    const commit = findRootSpan("batch.commit");

    const actionSpanId = action.spanContext().spanId;
    const runSpanId = run.spanContext().spanId;

    expect(run.parentSpanContext?.spanId).toBe(actionSpanId);
    expect(build.parentSpanContext?.spanId).toBe(runSpanId);
    expect(commitQueueWait.parentSpanContext?.spanId).toBe(runSpanId);
    expect(recordHistory.parentSpanContext?.spanId).toBe(runSpanId);
    expect(overlayApply.parentSpanContext?.spanId).toBe(runSpanId);
    expect(serverQueueWait.parentSpanContext?.spanId).toBe(runSpanId);
    expect(commit.parentSpanContext?.spanId).toBe(runSpanId);

    // Everything belongs to the same trace as the user action
    const traceId = action.spanContext().traceId;
    expect(run.spanContext().traceId).toBe(traceId);
    expect(commit.spanContext().traceId).toBe(traceId);

    // The write action reads documents and flushes signal transitions
    const names = getFinishedSpansForTest().map((s) => s.name);
    expect(names).toContain("firestore.getDoc");
    expect(names).toContain("solid.transitionFlush");
  });

  it("records the debounced range reset as a linked root span", async ({ db, task }) => {
    initTelemetry({ mode: "memory" });

    const { result, firestore } = await setupLifeLogsTest(task.id, db, {
      outOfRangeLifeLogs: [{ id: "$oldStart", text: "old start lifelog", daysAgo: 18, endDaysAgo: 18 }],
      lifeLogsProps: { debounceMs: 0 },
    });
    firestoreForCleanup = firestore;

    await result.findByText("first lifelog");

    // Jump to the out-of-range LifeLog's date, putting the selection outside
    // the current range, which schedules the debounced range reset
    await userEvent.keyboard("{d}");
    await awaitPendingCallbacks();
    const input = result.getByLabelText("日付");
    input.focus();
    await userEvent.keyboard("2025-12-23");
    await userEvent.keyboard("{Enter}");
    await awaitPendingCallbacks();

    await result.findByText("old start lifelog");
    await vi.waitFor(() => {
      if (!getFinishedSpansForTest().some((s) => s.name === "action:scroll.resetToSelected")) {
        throw new Error("scroll.resetToSelected span not recorded yet");
      }
    });

    const reset = findRootSpan("action:scroll.resetToSelected");
    expect(reset.parentSpanContext).toBeUndefined();
    expect(reset.attributes["app.doc_id"]).toBe("$oldStart");
    // Linked to the action that scheduled it (jumpToStartDate)
    expect(reset.links.length).toBeGreaterThan(0);
  });

  it("records the startup trace ending when the pane is ready", async ({ db, task }) => {
    initTelemetry({ mode: "memory" });
    beginStartup();

    const { result, firestore } = await setupLifeLogsTest(task.id, db);
    firestoreForCleanup = firestore;

    await result.findByText("first lifelog");
    await vi.waitFor(() => {
      if (!getFinishedSpansForTest().some((s) => s.name === "startup")) {
        throw new Error("startup span not ended yet");
      }
    });

    const startup = findRootSpan("startup");
    const authResolve = findRootSpan("startup.authResolve");
    const firstRangeQuery = findRootSpan("startup.firstRangeQuery");

    expect(startup.parentSpanContext).toBeUndefined();
    expect(authResolve.parentSpanContext?.spanId).toBe(startup.spanContext().spanId);
    expect(firstRangeQuery.parentSpanContext?.spanId).toBe(startup.spanContext().spanId);
    expect(startup.events.some((event) => event.name === "firestoreInitialized")).toBe(true);
  });

  it("records a root span when scrolling expands the range", async ({ db, task }) => {
    await page.viewport(1200, 600);
    initTelemetry({ mode: "memory" });

    // 60 items at 12h intervals; the initial ±14d range shows ~28 of them
    const halfdayLifeLogs = [];
    for (let i = 1; i <= 60; i++) {
      halfdayLifeLogs.push({
        id: `$h${String(i).padStart(3, "0")}`,
        text: `halfday ${i} lifelog`,
        daysAgo: i * 0.5 + 0.25,
        endDaysAgo: i * 0.5,
      });
    }

    const { result, firestore } = await setupLifeLogsTest(task.id, db, {
      outOfRangeLifeLogs: halfdayLifeLogs,
      lifeLogsProps: { debounceMs: 0 },
      skipDefaultLifeLogs: true,
      initialSelectedId: "$h001",
    });
    firestoreForCleanup = firestore;

    await new Promise((r) => setTimeout(r, 100));
    await awaitPendingCallbacks();
    await result.findByText("halfday 1 lifelog");

    const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
    const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
    wrapper.style.height = "400px";
    expect(container.scrollHeight).toBeGreaterThan(container.clientHeight);

    // Scroll to the top edge from a safe mid position (desktop = older direction)
    container.scrollTop = Math.floor(container.scrollHeight / 2);
    await new Promise((r) => setTimeout(r, 50));
    container.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 100));
    await awaitPendingCallbacks();

    await vi.waitFor(() => {
      if (!getFinishedSpansForTest().some((s) => s.name === "action:scroll.slideOlder")) {
        throw new Error("slideOlder span not recorded yet");
      }
    });

    const slide = findRootSpan("action:scroll.slideOlder");
    expect(slide.parentSpanContext).toBeUndefined();
    expect(slide.attributes["app.expand_ms"]).toBeTypeOf("number");
    expect(slide.attributes["app.range_width_ms"]).toBeTypeOf("number");
  });

  it("completes text via a one-shot ngrams getDocs, not a live subscription", async ({ db, task }) => {
    initTelemetry({ mode: "memory" });

    const { result, firestore } = await setupLifeLogsTest(task.id, db, {
      completionCandidates: ["gym workout 30min"],
    });
    firestoreForCleanup = firestore;

    await result.findByText("first lifelog");

    // Enter text editing and type a fragment matching the seeded candidate.
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();
    const input = result.container.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
    input.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("gym");
    await awaitPendingCallbacks();

    // The dropdown appearing proves the completion read ran and returned the candidate.
    await result.findByText("gym workout 30min");

    const spans = getFinishedSpansForTest();
    const ngramGetDocs = spans.filter(
      (s) => s.name === "firestore.getDocs" && s.attributes["app.collection"] === "ngrams",
    );
    const ngramSubscriptions = spans.filter(
      (s) => s.name === "snapshot.onQuerySnapshot" && s.attributes["app.collection"] === "ngrams",
    );

    // Completion issues a one-shot read of the ngrams corpus...
    expect(ngramGetDocs.length).toBeGreaterThan(0);
    // ...and never opens a live watch stream on it, whose per-write re-renders were the churn that
    // slowed an Escape-confirm to seconds.
    expect(ngramSubscriptions.length).toBe(0);
  });

  it("skips the batch when confirming unchanged text (no-op save)", async ({ db, task }) => {
    initTelemetry({ mode: "memory" });

    const { result, firestore } = await setupLifeLogsTest(task.id, db);
    firestoreForCleanup = firestore;

    await result.findByText("first lifelog");

    // Enter text editing and re-type the identical text: pendingText is set but unchanged.
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();
    const input = result.container.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
    input.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("first lifelog");
    await awaitPendingCallbacks();

    // Escape confirms; the text matches the saved value, so saveText must not write a batch.
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    await waitForPendingCommitsForTest({ service: firestore });

    const saveText = findRootSpan("action:panes.lifeLogs.saveText");
    const saveTextId = saveText.spanContext().spanId;
    const batchRuns = getFinishedSpansForTest().filter(
      (s) => s.name === "batch.run" && s.parentSpanContext?.spanId === saveTextId,
    );
    // The no-op is detected against the mirrored saved text — no getDoc, no batch.
    expect(batchRuns.length).toBe(0);
    expect(getFinishedSpansForTest().some((s) => s.name === "firestore.getDoc")).toBe(false);

    // Editing exited and the text is untouched.
    expect(result.container.querySelector("input")).toBeNull();
    await result.findByText("first lifelog");
  });
});
