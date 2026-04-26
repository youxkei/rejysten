import {
  doc,
  query as firestoreQuery,
  where as firestoreWhere,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

import { createFirestoreClient, type FirestoreClient } from "@/firestore/client";
import { getDoc, getDocs } from "@/firestore/get";
import { limit, orderBy, query, where } from "@/firestore/query";
import {
  createTestFirestore,
  getSnapshotData,
  seedDocs,
  testCollection,
  type FirestoreTestDoc,
} from "@/firestore/testUtils";
import { acquireEmulator, releaseEmulator } from "@/test";

let emulatorPort: number;
let firestore: ReturnType<typeof createTestFirestore>;
let client: FirestoreClient;

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
  firestore = createTestFirestore(emulatorPort, "firestore-get-test");
  client = createFirestoreClient(firestore);
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

describe("getDoc overlay boundary", () => {
  it("fromServer returns unmerged server data while default read includes overlay", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_get_doc_overlay`);
    await seedDocs(col, {
      doc1: { text: "server", value: 1 },
    });

    client.overlay.apply("batch-get-doc-boundary", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { text: "optimistic", value: 2 },
      },
    ]);

    const fromServer = await getDoc({
      client,
      ref: doc(col, "doc1"),
      getSnapshotData,
      fromServer: true,
    });
    const merged = await getDoc({ client, ref: doc(col, "doc1"), getSnapshotData });

    test.expect(fromServer?.text).toBe("server");
    test.expect(fromServer?.value).toBe(1);
    test.expect(merged?.text).toBe("optimistic");
    test.expect(merged?.value).toBe(2);

    client.overlay.rollback("batch-get-doc-boundary", undefined);
  });

  it("can explicitly ignore a pending overlay", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_apply_overlay_false`);
    await seedDocs(col, {
      doc1: { text: "server", value: 1 },
    });

    const batchId = `manual-${test.task.id}`;
    client.overlay.apply(batchId, [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { text: "overlay", value: 2 },
      },
    ]);

    try {
      await test
        .expect(
          getDoc({
            client,
            ref: doc(col, "doc1"),
            getSnapshotData,
            applyOverlay: false,
          }),
        )
        .resolves.toMatchObject({ id: "doc1", text: "server", value: 1 });
      await test
        .expect(getDoc({ client, ref: doc(col, "doc1"), getSnapshotData }))
        .resolves.toMatchObject({ id: "doc1", text: "overlay", value: 2 });
    } finally {
      client.overlay.rollback(batchId, undefined);
    }
  });

  it("fromServer read can clear a committed overlay before the default read", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_from_server_catchup`);
    await seedDocs(col, {
      doc1: { text: "server", value: 1 },
    });

    client.overlay.apply("batch-from-server-catchup", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { text: "server", value: 1 },
      },
    ]);
    client.overlay.markCommitted("batch-from-server-catchup");

    const fromServer = await getDoc({
      client,
      ref: doc(col, "doc1"),
      getSnapshotData,
      fromServer: true,
    });
    const merged = await getDoc({ client, ref: doc(col, "doc1"), getSnapshotData });

    test.expect(fromServer?.text).toBe("server");
    test.expect(merged?.text).toBe("server");
  });
});

describe("getDocs overlay boundary", () => {
  it("fromServer returns server snapshot while default read includes pending set", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_get_docs_overlay`);
    await seedDocs(col, {
      server: { text: "server", value: 1 },
    });

    client.overlay.apply("batch-get-docs-boundary", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1 },
      },
    ]);

    const fromServer = await getDocs({
      client,
      query: query(col),
      getSnapshotData,
      fromServer: true,
    });
    const merged = await getDocs({ client, query: query(col), getSnapshotData });

    test.expect(fromServer.map((d) => d.id)).toEqual(["server"]);
    test.expect(merged.map((d) => d.id).sort()).toEqual(["pending", "server"]);

    client.overlay.rollback("batch-get-docs-boundary", undefined);
  });

  it("recalculates a limited optimistic query from over-fetched backfill", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_get_docs_limit_backfill`);
    await seedDocs(col, {
      first: { text: "first", value: 1 },
      second: { text: "second", value: 2 },
      third: { text: "third", value: 3 },
    });

    client.overlay.apply("batch-get-docs-limit-backfill", [
      {
        type: "delete",
        batchId: "",
        collection: col.id,
        id: "first",
        path: `${col.id}/first`,
      },
    ]);

    const result = await getDocs({
      client,
      query: query(col, orderBy("value"), limit(1)),
      getSnapshotData,
    });

    test.expect(result.map((d) => d.id)).toEqual(["second"]);

    client.overlay.rollback("batch-get-docs-limit-backfill", undefined);
  });

  it("recalculates a limited optimistic query when an update crosses the limit boundary", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_get_docs_limit_update_backfill`);
    await seedDocs(col, {
      first: { text: "first", value: 1 },
      second: { text: "second", value: 2 },
      third: { text: "third", value: 3 },
    });

    client.overlay.apply("batch-get-docs-limit-update-backfill", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "first",
        path: `${col.id}/first`,
        data: { value: 99 },
      },
    ]);

    const result = await getDocs({
      client,
      query: query(col, orderBy("value"), limit(1)),
      getSnapshotData,
    });

    test.expect(result.map((d) => d.id)).toEqual(["second"]);

    client.overlay.rollback("batch-get-docs-limit-update-backfill", undefined);
  });

  it("fromServer trims an over-fetched wrapper limit back to the requested count", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_get_docs_from_server_limit_trim`);
    await seedDocs(col, {
      first: { text: "first", value: 1 },
      second: { text: "second", value: 2 },
      third: { text: "third", value: 3 },
    });

    const result = await getDocs({
      client,
      query: query(col, orderBy("value"), limit(1)),
      getSnapshotData,
      fromServer: true,
    });

    test.expect(result.map((d) => d.id)).toEqual(["first"]);
  });

  it("with a raw Firestore query does not apply overlay", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_raw_query_overlay`);
    await seedDocs(col, {
      server: { text: "server", value: 1 },
    });

    client.overlay.apply("batch-raw-query-boundary", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1 },
      },
    ]);

    const rawResult = await getDocs({ client, query: firestoreQuery(col), getSnapshotData });
    const wrappedResult = await getDocs({ client, query: query(col), getSnapshotData });

    test.expect(rawResult.map((d) => d.id)).toEqual(["server"]);
    test.expect(wrappedResult.map((d) => d.id).sort()).toEqual(["pending", "server"]);

    client.overlay.rollback("batch-raw-query-boundary", undefined);
  });

  it("with mixed raw constraints does not apply overlay", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_mixed_raw_constraint`);
    await seedDocs(col, {
      server: { text: "server", value: 1 },
    });

    client.overlay.apply("batch-mixed-raw-boundary", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1 },
      },
    ]);

    const mixedRawResult = await getDocs({
      client,
      query: query(col, firestoreWhere("value", "==", 1)),
      getSnapshotData,
    });
    const wrappedResult = await getDocs({
      client,
      query: query(col, where("value", "==", 1)),
      getSnapshotData,
    });

    test.expect(mixedRawResult.map((d) => d.id)).toEqual(["server"]);
    test.expect(wrappedResult.map((d) => d.id).sort()).toEqual(["pending", "server"]);

    client.overlay.rollback("batch-mixed-raw-boundary", undefined);
  });

  it("with unsupported wrapper filter fails closed without overlay", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_unsupported_in_filter`);
    await seedDocs(col, {
      server: { text: "server", value: 1 },
    });

    client.overlay.apply("batch-unsupported-in-boundary", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1 },
      },
    ]);

    const result = await getDocs({
      client,
      query: query(col, where("text", "in", ["server", "pending"])),
      getSnapshotData,
    });

    test.expect(result.map((d) => d.id)).toEqual(["server"]);

    client.overlay.rollback("batch-unsupported-in-boundary", undefined);
  });

  it("with unsupported array-contains filter fails closed without overlay", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_unsupported_array_contains`);
    await seedDocs(col, {
      server: { text: "server", value: 1, tags: ["match"] },
    });

    client.overlay.apply("batch-unsupported-array-boundary", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1, tags: ["match"] },
      },
    ]);

    const result = await getDocs({
      client,
      query: query(col, where("tags", "array-contains", "match")),
      getSnapshotData,
    });

    test.expect(result.map((d) => d.id)).toEqual(["server"]);

    client.overlay.rollback("batch-unsupported-array-boundary", undefined);
  });

  it("fromServer empty snapshot clears committed overlay for a filtered query", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_from_server_empty_catchup`);

    client.overlay.acknowledgeDocument(`${col.id}/doc1`, { text: "server", value: 1 });
    client.overlay.apply("batch-from-server-empty-catchup", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { value: 2 },
      },
    ]);
    client.overlay.markCommitted("batch-from-server-empty-catchup");

    const fromServer = await getDocs({
      client,
      query: query(col, where("value", "==", 1)),
      getSnapshotData: getSnapshotData<FirestoreTestDoc>,
      fromServer: true,
    });
    const merged = await getDocs({
      client,
      query: query(col, where("value", "==", 1)),
      getSnapshotData: getSnapshotData<FirestoreTestDoc>,
    });

    test.expect(fromServer).toEqual([]);
    test.expect(merged).toEqual([]);
  });
});
