import { doc } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { optimisticBatch, waitForPendingOptimisticCommits } from "@/firestore/batch";
import { createFirestoreClient, type FirestoreClient } from "@/firestore/client";
import { getDoc, getDocs } from "@/firestore/get";
import { onQuerySnapshot } from "@/firestore/onSnapshot";
import { query } from "@/firestore/query";
import { createTestFirestore, seedDocs, testCollection } from "@/firestore/testUtils";
import { getFinishedSpansForTest, initTelemetry, resetTelemetryForTest } from "@/telemetry/provider";
import { beginAction } from "@/telemetry/span";
import { acquireEmulator, releaseEmulator } from "@/test";

let emulatorPort: number;
let firestore: ReturnType<typeof createTestFirestore>;
let client: FirestoreClient;

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
  firestore = createTestFirestore(emulatorPort, "firestore-telemetry-test");
  client = createFirestoreClient(firestore);
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

afterEach(async () => {
  await resetTelemetryForTest();
});

function findSpan(name: string) {
  const span = getFinishedSpansForTest().find((s) => s.name === name);
  if (!span) throw new Error(`span "${name}" not found`);
  return span;
}

describe("firestore telemetry", () => {
  it("records getDoc spans with collection and source attributes", async (test) => {
    initTelemetry({ mode: "memory" });

    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_telemetry_get_doc`);
    await seedDocs(col, { doc1: { text: "hello", value: 1 } });

    await getDoc({ client, ref: doc(col, "doc1") });

    const span = findSpan("firestore.getDoc");
    expect(span.attributes["app.collection"]).toBe(col.id);
    expect(span.attributes["app.doc_id"]).toBe("doc1");
    expect(["cache", "server"]).toContain(span.attributes["app.source"]);
  });

  it("reads a pending create from the overlay without hitting the server", async (test) => {
    initTelemetry({ mode: "memory" });

    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_telemetry_get_doc_overlay`);
    // Intentionally not seeded on the server — the doc exists only in the overlay,
    // mirroring a node that was just created locally and not yet committed.
    client.overlay.apply("batch-telemetry-overlay-create", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1 },
      },
    ]);

    try {
      const result = await getDoc({ client, ref: doc(col, "pending") });

      expect(result).toMatchObject({ id: "pending", text: "pending", value: 1 });

      const span = findSpan("firestore.getDoc");
      expect(span.attributes["app.source"]).toBe("overlay");
    } finally {
      client.overlay.rollback("batch-telemetry-overlay-create", undefined);
    }
  });

  it("records getDocs spans with doc count", async (test) => {
    initTelemetry({ mode: "memory" });

    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_telemetry_get_docs`);
    await seedDocs(col, {
      doc1: { text: "one", value: 1 },
      doc2: { text: "two", value: 2 },
    });

    const result = await getDocs({ client, query: query(col) });

    const span = findSpan("firestore.getDocs");
    expect(span.attributes["app.collection"]).toBe(col.id);
    expect(span.attributes["app.doc_count"]).toBe(result.length);
    expect(result.length).toBe(2);
  });

  it("parents getDoc spans to the current action", async (test) => {
    initTelemetry({ mode: "memory" });

    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_telemetry_get_doc_parent`);
    await seedDocs(col, { doc1: { text: "hello", value: 1 } });

    const handle = beginAction("panes.lifeLogs.navigateNext");
    await handle.runBody(async () => {
      await getDoc({ client, ref: doc(col, "doc1") });
    });

    const root = findSpan("action:panes.lifeLogs.navigateNext");
    const child = findSpan("firestore.getDoc");
    expect(child.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
  });

  it("records overlay apply and server commit spans for optimistic batches", async (test) => {
    initTelemetry({ mode: "memory" });

    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_telemetry_batch_commit`);

    const handle = beginAction("panes.lifeLogs.setStartAtNow");
    await handle.runBody(() => {
      const batch = optimisticBatch(client, { parentSpan: handle.span });
      batch.set(doc(col, "doc1"), { text: "created", value: 1 });
      batch.commit();
      return Promise.resolve();
    });
    await waitForPendingOptimisticCommits({ client });

    const root = findSpan("action:panes.lifeLogs.setStartAtNow");
    const overlayApply = findSpan("overlay.apply");
    const serverQueueWait = findSpan("batch.serverQueueWait");
    const commit = findSpan("batch.commit");

    expect(overlayApply.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    expect(overlayApply.attributes["app.mutation_count"]).toBe(1);
    expect(serverQueueWait.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    expect(commit.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    expect(commit.attributes["app.mutation_count"]).toBe(1);
  });

  it("records snapshot spans as roots with mergeQuery children and an action link", async (test) => {
    initTelemetry({ mode: "memory" });

    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_telemetry_snapshot`);
    await seedDocs(col, { doc1: { text: "one", value: 1 } });

    const handle = beginAction("panes.lifeLogs.navigateNext");
    await handle.runBody(() => Promise.resolve());
    const actionTraceId = findSpan("action:panes.lifeLogs.navigateNext").spanContext().traceId;

    const unsubscribe = onQuerySnapshot({
      client,
      query: query(col),
      setValue: () => undefined,
    });
    try {
      await vi.waitFor(() => {
        if (!getFinishedSpansForTest().some((s) => s.name === "snapshot.onQuerySnapshot")) {
          throw new Error("snapshot span not recorded yet");
        }
      });
    } finally {
      unsubscribe();
    }

    const snapshot = findSpan("snapshot.onQuerySnapshot");
    expect(snapshot.parentSpanContext).toBeUndefined();
    expect(snapshot.attributes["app.collection"]).toBe(col.id);
    expect(snapshot.links[0]?.context.traceId).toBe(actionTraceId);

    const snapshotSpanIds = new Set(
      getFinishedSpansForTest()
        .filter((s) => s.name === "snapshot.onQuerySnapshot")
        .map((s) => s.spanContext().spanId),
    );
    const merges = getFinishedSpansForTest().filter((s) => s.name === "overlay.mergeQuery");
    expect(merges.length).toBeGreaterThan(0);
    for (const merge of merges) {
      expect(merge.parentSpanContext).toBeDefined();
      expect(snapshotSpanIds.has(merge.parentSpanContext!.spanId)).toBe(true);
    }
  });
});
