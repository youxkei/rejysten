import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

import {
  optimisticBatch,
  waitForPendingOptimisticCommits,
} from "@/firestore/batch";
import { createFirestoreClient, type FirestoreClient } from "@/firestore/client";
import { getDoc } from "@/firestore/get";
import {
  onDocumentSnapshot,
  onQuerySnapshot,
  shouldAcknowledgeSnapshotMetadata,
} from "@/firestore/onSnapshot";
import { limit, orderBy, query, where } from "@/firestore/query";
import {
  createTestFirestore,
  getSnapshotData,
  seedDocs,
  testCollection,
  type FirestoreTestDoc,
  type FirestoreTestDocWithId,
  wait,
  waitUntil,
} from "@/firestore/testUtils";
import { acquireEmulator, releaseEmulator } from "@/test";

let emulatorPort: number;
let firestore: ReturnType<typeof createTestFirestore>;
let client: FirestoreClient;

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
  firestore = createTestFirestore(emulatorPort, "firestore-onsnapshot-test");
  client = createFirestoreClient(firestore);
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

describe("onDocumentSnapshot optimistic overlay", () => {
  it("does not synchronously emit an undefined document before the first server snapshot", async (test) => {
    const localClient = createFirestoreClient(firestore);
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_doc_initial_undefined`);
    let setValueCount = 0;
    let latest: FirestoreTestDocWithId | undefined | "unset" = "unset";

    const unsubscribe = onDocumentSnapshot({
      client: localClient,
      ref: doc(col, "missing"),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
        setValueCount++;
      },
    });

    try {
      test.expect(setValueCount).toBe(0);
      test.expect(latest).toBe("unset");

      await waitUntil(() => setValueCount === 1);
      test.expect(latest).toBeUndefined();
    } finally {
      unsubscribe();
    }
  });

  it("calls setValue synchronously during optimisticBatch commit", async (test) => {
    const localClient = createFirestoreClient(firestore);
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_commit_sync_set_value`);
    let armed = false;
    let setValueCount = 0;
    let latest: FirestoreTestDocWithId | undefined;

    const unsubscribe = onDocumentSnapshot({
      client: localClient,
      ref: doc(col, "doc1"),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
        if (armed) {
          setValueCount++;
        }
      },
    });

    try {
      armed = true;
      const batch = optimisticBatch(localClient);
      batch.set(doc(col, "doc1"), { text: "sync", value: 1 });
      batch.commit();

      test.expect(latest).toMatchObject({ id: "doc1", text: "sync", value: 1 });
      test.expect(setValueCount).toBe(1);

      await waitForPendingOptimisticCommits({ client: localClient });
    } finally {
      unsubscribe();
    }
  });

  it("calls setValue once for optimistic update followed by the same server update", async (test) => {
    const equalityClient = createFirestoreClient(firestore, {
      snapshot: {
        ignoredFieldsForEquality: ["createdAt", "updatedAt"],
      },
    });
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_doc_update_once`);
    await seedDocs(col, {
      doc1: { text: "server", value: 1 },
    });
    const batchId = `batch-${test.task.id}`;
    let armed = false;
    let setValueCount = 0;
    let latest: FirestoreTestDocWithId | undefined;

    const unsubscribe = onDocumentSnapshot({
      client: equalityClient,
      ref: doc(col, "doc1"),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
        if (armed) {
          setValueCount++;
        }
      },
    });

    try {
      await waitUntil(() => latest?.text === "server");
      armed = true;

      equalityClient.overlay.apply(batchId, [
        {
          type: "update",
          batchId: "",
          collection: col.id,
          id: "doc1",
          path: `${col.id}/doc1`,
          data: { text: "optimistic", value: 2 },
        },
      ]);
      await waitUntil(() => latest?.text === "optimistic" && latest.value === 2);

      await writeBatch(firestore)
        .update(doc(col, "doc1"), {
          text: "optimistic",
          value: 2,
          updatedAt: serverTimestamp(),
        })
        .commit();
      equalityClient.overlay.markCommitted(batchId);
      await getDoc({
        client: equalityClient,
        ref: doc(col, "doc1"),
        getSnapshotData,
        fromServer: true,
      });
      await wait(300);

      test.expect(latest?.text).toBe("optimistic");
      test.expect(latest?.value).toBe(2);
      test.expect(setValueCount).toBe(1);
    } finally {
      equalityClient.overlay.rollback(batchId, undefined);
      unsubscribe();
    }
  });

  it("emits an optimistic set and keeps the committed server value", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_doc_set`);
    const batchId = `batch-${test.task.id}`;
    let latest: FirestoreTestDocWithId | undefined;

    const unsubscribe = onDocumentSnapshot({
      client,
      ref: doc(col, "doc1"),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
      },
    });

    try {
      await wait(100);
      client.overlay.apply(batchId, [
        {
          type: "set",
          batchId: "",
          collection: col.id,
          id: "doc1",
          path: `${col.id}/doc1`,
          data: { text: "optimistic", value: 1 },
        },
      ]);
      await waitUntil(() => latest?.text === "optimistic");

      await writeBatch(firestore)
        .set(doc(col, "doc1"), {
          text: "optimistic",
          value: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        .commit();
      client.overlay.markCommitted(batchId);
      await getDoc({ client, ref: doc(col, "doc1"), getSnapshotData, fromServer: true });
      await waitUntil(() => latest?.text === "optimistic");

      test.expect(latest?.text).toBe("optimistic");
      test.expect(latest?.value).toBe(1);
    } finally {
      client.overlay.rollback(batchId, undefined);
      unsubscribe();
    }
  });

  it("emits overlay changes even when acknowledgement is disabled", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_doc_overlay_no_ack`);
    const batchId = `batch-${test.task.id}`;
    let latest: FirestoreTestDocWithId | undefined;

    const unsubscribe = onDocumentSnapshot({
      client,
      ref: doc(col, "doc1"),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
      },
      shouldAcknowledge: () => false,
    });

    try {
      await wait(100);
      client.overlay.apply(batchId, [
        {
          type: "set",
          batchId: "",
          collection: col.id,
          id: "doc1",
          path: `${col.id}/doc1`,
          data: { text: "optimistic", value: 1 },
        },
      ]);
      await waitUntil(() => latest?.text === "optimistic");

      test.expect(latest?.text).toBe("optimistic");
    } finally {
      client.overlay.rollback(batchId, undefined);
      unsubscribe();
    }
  });

  it("merges a pending update into an existing snapshot", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_doc_update`);
    await seedDocs(col, {
      doc1: { text: "server", value: 1 },
    });
    const batchId = `batch-${test.task.id}`;
    let latest: FirestoreTestDocWithId | undefined;

    const unsubscribe = onDocumentSnapshot({
      client,
      ref: doc(col, "doc1"),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
      },
    });

    try {
      await waitUntil(() => latest?.text === "server");
      client.overlay.apply(batchId, [
        {
          type: "update",
          batchId: "",
          collection: col.id,
          id: "doc1",
          path: `${col.id}/doc1`,
          data: { text: "optimistic", value: 2 },
        },
      ]);
      await waitUntil(() => latest?.text === "optimistic" && latest.value === 2);

      test.expect(latest?.text).toBe("optimistic");
      test.expect(latest?.value).toBe(2);
    } finally {
      client.overlay.rollback(batchId, undefined);
      unsubscribe();
    }
  });

  it("hides a document with a pending delete", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_doc_delete`);
    await seedDocs(col, {
      doc1: { text: "server", value: 1 },
    });
    const batchId = `batch-${test.task.id}`;
    let latest: FirestoreTestDocWithId | undefined;

    const unsubscribe = onDocumentSnapshot({
      client,
      ref: doc(col, "doc1"),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
      },
    });

    try {
      await waitUntil(() => latest?.text === "server");
      client.overlay.apply(batchId, [
        {
          type: "delete",
          batchId: "",
          collection: col.id,
          id: "doc1",
          path: `${col.id}/doc1`,
        },
      ]);
      await waitUntil(() => latest === undefined);

      test.expect(latest).toBeUndefined();
    } finally {
      client.overlay.rollback(batchId, undefined);
      unsubscribe();
    }
  });
});

describe("onQuerySnapshot optimistic overlay", () => {
  it("does not synchronously emit an empty query before the first server snapshot", async (test) => {
    const localClient = createFirestoreClient(firestore);
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_query_initial_empty`);
    let setValueCount = 0;
    let latest: FirestoreTestDocWithId[] | undefined;

    const unsubscribe = onQuerySnapshot({
      client: localClient,
      query: query(col),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
        setValueCount++;
      },
    });

    try {
      test.expect(setValueCount).toBe(0);
      test.expect(latest).toBeUndefined();

      await waitUntil(() => setValueCount === 1);
      test.expect(latest).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it("synchronously emits a pre-existing pending set before the first server snapshot", async (test) => {
    const localClient = createFirestoreClient(firestore);
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_query_initial_overlay`);
    localClient.overlay.apply("batch-initial-overlay", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "from-overlay", value: 1 },
      },
    ]);

    let latest: FirestoreTestDocWithId[] | undefined;

    const unsubscribe = onQuerySnapshot({
      client: localClient,
      query: query(col),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
      },
    });

    try {
      test.expect(latest).toEqual([{ id: "pending", text: "from-overlay", value: 1 }]);
    } finally {
      localClient.overlay.rollback("batch-initial-overlay", undefined);
      unsubscribe();
    }
  });

  it("synchronously emits only affected document and query listeners for mixed set update delete across collections", async (test) => {
    const localClient = createFirestoreClient(firestore);
    const colA = testCollection(firestore, `${test.task.id}_${Date.now()}_mixed_a`);
    const colB = testCollection(firestore, `${test.task.id}_${Date.now()}_mixed_b`);
    const colC = testCollection(firestore, `${test.task.id}_${Date.now()}_mixed_c`);

    await seedDocs(colA, {
      updateMe: { text: "old", value: 1 },
      deleteMe: { text: "delete", value: 1 },
    });
    await seedDocs(colC, {
      untouched: { text: "untouched", value: 1 },
    });

    let armed = false;
    const counts = {
      docSet: 0,
      docUpdate: 0,
      docDelete: 0,
      queryA: 0,
      queryAValueOne: 0,
      queryB: 0,
      queryC: 0,
    };
    const latest: {
      docSet?: FirestoreTestDocWithId;
      docUpdate?: FirestoreTestDocWithId;
      docDelete?: FirestoreTestDocWithId;
      queryA: FirestoreTestDocWithId[];
      queryAValueOne: FirestoreTestDocWithId[];
      queryB: FirestoreTestDocWithId[];
      queryC: FirestoreTestDocWithId[];
    } = {
      queryA: [],
      queryAValueOne: [],
      queryB: [],
      queryC: [],
    };

    const unsubscribes = [
      onDocumentSnapshot({
        client: localClient,
        ref: doc(colA, "created"),
        getSnapshotData,
        setValue: (value) => {
          latest.docSet = value;
          if (armed) counts.docSet++;
        },
      }),
      onDocumentSnapshot({
        client: localClient,
        ref: doc(colA, "updateMe"),
        getSnapshotData,
        setValue: (value) => {
          latest.docUpdate = value;
          if (armed) counts.docUpdate++;
        },
      }),
      onDocumentSnapshot({
        client: localClient,
        ref: doc(colA, "deleteMe"),
        getSnapshotData,
        setValue: (value) => {
          latest.docDelete = value;
          if (armed) counts.docDelete++;
        },
      }),
      onQuerySnapshot({
        client: localClient,
        query: query(colA, orderBy("value")),
        getSnapshotData,
        setValue: (value) => {
          latest.queryA = value;
          if (armed) counts.queryA++;
        },
      }),
      onQuerySnapshot({
        client: localClient,
        query: query(colA, where("value", "==", 1), orderBy("text")),
        getSnapshotData,
        setValue: (value) => {
          latest.queryAValueOne = value;
          if (armed) counts.queryAValueOne++;
        },
      }),
      onQuerySnapshot({
        client: localClient,
        query: query(colB),
        getSnapshotData,
        setValue: (value) => {
          latest.queryB = value;
          if (armed) counts.queryB++;
        },
      }),
      onQuerySnapshot({
        client: localClient,
        query: query(colC),
        getSnapshotData,
        setValue: (value) => {
          latest.queryC = value;
          if (armed) counts.queryC++;
        },
      }),
    ];

    try {
      await waitUntil(() =>
        latest.docUpdate?.text === "old" &&
        latest.docDelete?.text === "delete" &&
        latest.queryA.length === 2 &&
        latest.queryAValueOne.length === 2 &&
        latest.queryC.length === 1,
      );

      armed = true;
      const batch = optimisticBatch(localClient);
      batch
        .set(doc(colA, "created"), { text: "created", value: 1 })
        .update(doc(colA, "updateMe"), { text: "updated", value: 2 })
        .delete(doc(colA, "deleteMe"))
        .set(doc(colB, "other"), { text: "other", value: 1 });
      batch.commit();

      test.expect(latest.docSet).toMatchObject({ id: "created", text: "created", value: 1 });
      test.expect(latest.docUpdate).toMatchObject({ id: "updateMe", text: "updated", value: 2 });
      test.expect(latest.docDelete).toBeUndefined();
      test.expect(latest.queryA.map((docData) => docData.id)).toEqual(["created", "updateMe"]);
      test.expect(latest.queryAValueOne.map((docData) => docData.id)).toEqual(["created"]);
      test.expect(latest.queryB.map((docData) => docData.id)).toEqual(["other"]);
      test.expect(latest.queryC.map((docData) => docData.id)).toEqual(["untouched"]);
      test.expect(counts).toEqual({
        docSet: 1,
        docUpdate: 1,
        docDelete: 1,
        queryA: 1,
        queryAValueOne: 1,
        queryB: 1,
        queryC: 0,
      });

      await waitForPendingOptimisticCommits({ client: localClient });
    } finally {
      unsubscribes.forEach((unsubscribe) => {
        unsubscribe();
      });
    }
  });

  it("emits consecutive optimistic commits and does not emit again when matching server data arrives", async (test) => {
    const localClient = createFirestoreClient(firestore, {
      snapshot: {
        ignoredFieldsForEquality: ["createdAt", "updatedAt"],
      },
    });
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_query_consecutive_commits`);
    let armed = false;
    let setValueCount = 0;
    let latest: FirestoreTestDocWithId[] = [];
    let finalRemoteSnapshotSeen = false;

    const unsubscribe = onQuerySnapshot({
      client: localClient,
      query: query(col),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
        if (armed) {
          setValueCount++;
        }
      },
      onServerSnapshot: (snapshot) => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        finalRemoteSnapshotSeen = snapshot.docs.some((docSnap) => {
          const data = docSnap.data();
          return docSnap.id === "doc1" && data.text === "second" && data.value === 2;
        });
      },
    });

    try {
      await waitUntil(() => latest.length === 0);
      armed = true;

      const firstBatch = optimisticBatch(localClient);
      firstBatch.set(doc(col, "doc1"), { text: "first", value: 1 });
      firstBatch.commit();

      test.expect(latest).toEqual([{ id: "doc1", text: "first", value: 1 }]);
      test.expect(setValueCount).toBe(1);

      const secondBatch = optimisticBatch(localClient);
      secondBatch.update(doc(col, "doc1"), { text: "second", value: 2 });
      secondBatch.commit();

      test.expect(latest).toEqual([{ id: "doc1", text: "second", value: 2 }]);
      test.expect(setValueCount).toBe(2);

      await waitForPendingOptimisticCommits({ client: localClient });
      await waitUntil(() => finalRemoteSnapshotSeen);
      await wait(100);

      test.expect(latest).toEqual([{ id: "doc1", text: "second", value: 2 }]);
      test.expect(setValueCount).toBe(2);
    } finally {
      unsubscribe();
    }
  });

  it("recomputes limited queries once on commit and does not notify unrelated limited queries", async (test) => {
    const localClient = createFirestoreClient(firestore);
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_limit`);
    const otherCol = testCollection(firestore, `${test.task.id}_${Date.now()}_limit_other`);

    await seedDocs(col, {
      first: { text: "first", value: 1 },
      second: { text: "second", value: 2 },
      third: { text: "third", value: 3 },
    });
    await seedDocs(otherCol, {
      other: { text: "other", value: 1 },
    });

    let armed = false;
    let limitedCount = 0;
    let limitedDescCount = 0;
    let unrelatedCount = 0;
    let limited: FirestoreTestDocWithId[] = [];
    let limitedDesc: FirestoreTestDocWithId[] = [];
    let unrelated: FirestoreTestDocWithId[] = [];

    const unsubscribes = [
      onQuerySnapshot({
        client: localClient,
        query: query(col, orderBy("value"), limit(1)),
        getSnapshotData,
        setValue: (value) => {
          limited = value;
          if (armed) limitedCount++;
        },
      }),
      onQuerySnapshot({
        client: localClient,
        query: query(col, orderBy("value", "desc"), limit(2)),
        getSnapshotData,
        setValue: (value) => {
          limitedDesc = value;
          if (armed) limitedDescCount++;
        },
      }),
      onQuerySnapshot({
        client: localClient,
        query: query(otherCol, orderBy("value"), limit(1)),
        getSnapshotData,
        setValue: (value) => {
          unrelated = value;
          if (armed) unrelatedCount++;
        },
      }),
    ];

    try {
      await waitUntil(() =>
        limited.map((docData) => docData.id).join(",") === "first" &&
        limitedDesc.map((docData) => docData.id).join(",") === "third,second" &&
        unrelated.map((docData) => docData.id).join(",") === "other",
      );

      armed = true;
      const batch = optimisticBatch(localClient);
      batch
        .delete(doc(col, "first"))
        .update(doc(col, "third"), { value: 0 })
        .set(doc(col, "newTop"), { text: "newTop", value: 10 });
      batch.commit();

      test.expect(limited.map((docData) => docData.id)).toEqual(["third"]);
      test.expect(limitedDesc.map((docData) => docData.id)).toEqual(["newTop", "second"]);
      test.expect(unrelated.map((docData) => docData.id)).toEqual(["other"]);
      test.expect(limitedCount).toBe(1);
      test.expect(limitedDescCount).toBe(1);
      test.expect(unrelatedCount).toBe(0);

      await waitForPendingOptimisticCommits({ client: localClient });
    } finally {
      unsubscribes.forEach((unsubscribe) => {
        unsubscribe();
      });
    }
  });

  it("emits a pending set in query results", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_query_set`);
    await seedDocs(col, {
      server: { text: "from-server", value: 1 },
    });
    const batchId = `batch-${test.task.id}`;
    let latest: FirestoreTestDocWithId[] = [];

    const unsubscribe = onQuerySnapshot({
      client,
      query: query(col),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
      },
    });

    try {
      await waitUntil(() => latest.some((docData) => docData.id === "server"));
      client.overlay.apply(batchId, [
        {
          type: "set",
          batchId: "",
          collection: col.id,
          id: "pending",
          path: `${col.id}/pending`,
          data: { text: "from-overlay", value: 2 },
        },
      ]);
      await waitUntil(() => latest.some((docData) => docData.id === "pending"));

      test.expect(latest.map((docData) => docData.text).sort()).toEqual(["from-overlay", "from-server"]);
    } finally {
      client.overlay.rollback(batchId, undefined);
      unsubscribe();
    }
  });

  it("merges pending update and delete into query results", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_query_update_delete`);
    await seedDocs(col, {
      keep: { text: "keep", value: 1 },
      "move-out": { text: "move-out", value: 1 },
      delete: { text: "delete", value: 1 },
    });
    const batchId = `batch-${test.task.id}`;
    let latest: FirestoreTestDocWithId[] = [];

    const unsubscribe = onQuerySnapshot({
      client,
      query: query(col, where("value", "==", 1)),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
      },
    });

    try {
      await waitUntil(() => latest.length === 3);
      client.overlay.apply(batchId, [
        {
          type: "update",
          batchId: "",
          collection: col.id,
          id: "move-out",
          path: `${col.id}/move-out`,
          data: { value: 2 },
        },
        {
          type: "delete",
          batchId: "",
          collection: col.id,
          id: "delete",
          path: `${col.id}/delete`,
        },
      ]);
      await waitUntil(() => latest.map((docData) => docData.id).join(",") === "keep");

      test.expect(latest.map((docData) => docData.id)).toEqual(["keep"]);
    } finally {
      client.overlay.rollback(batchId, undefined);
      unsubscribe();
    }
  });

  it("emits overlay changes even when acknowledgement is disabled", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_query_overlay_no_ack`);
    const batchId = `batch-${test.task.id}`;
    let latest: FirestoreTestDocWithId[] = [];

    const unsubscribe = onQuerySnapshot({
      client,
      query: query(col),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
      },
      shouldAcknowledge: () => false,
    });

    try {
      await wait(100);
      client.overlay.apply(batchId, [
        {
          type: "set",
          batchId: "",
          collection: col.id,
          id: "doc1",
          path: `${col.id}/doc1`,
          data: { text: "optimistic", value: 1 },
        },
      ]);
      await waitUntil(() => latest.length === 1 && latest[0].text === "optimistic");

      test.expect(latest.map((docData) => docData.text)).toEqual(["optimistic"]);
    } finally {
      client.overlay.rollback(batchId, undefined);
      unsubscribe();
    }
  });

  it("clears committed overlay when a filtered subscription receives an empty server result", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_filtered_empty_subscription_catchup`);
    client.overlay.acknowledgeDocument(`${col.id}/doc1`, { text: "server", value: 1 });
    client.overlay.apply("batch-filtered-empty-subscription-catchup", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { value: 2 },
      },
    ]);
    client.overlay.markCommitted("batch-filtered-empty-subscription-catchup");

    let latest: FirestoreTestDocWithId[] = [];
    const unsubscribe = onQuerySnapshot({
      client,
      query: query(col, where("value", "==", 1)),
      getSnapshotData: getSnapshotData<FirestoreTestDoc>,
      setValue: (value) => {
        latest = value;
      },
    });

    try {
      await wait(250);
      const after = client.overlay.mergeDocument<FirestoreTestDoc>(col.id, "doc1", {
        id: "doc1",
        text: "new-server",
        value: 3,
      });

      test.expect(latest).toEqual([]);
      test.expect(after?.text).toBe("new-server");
    } finally {
      unsubscribe();
    }
  });

  it("does not hide a same-id server recreation after a committed filtered delete", async (test) => {
    const col = testCollection(firestore, `${test.task.id}_${Date.now()}_filtered_delete_recreate`);
    await seedDocs(col, {
      doc1: { text: "recreated", value: 1 },
    });

    client.overlay.apply("batch-filtered-delete-recreate", [
      {
        type: "delete",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
      },
    ]);
    client.overlay.markCommitted("batch-filtered-delete-recreate");

    let latest: FirestoreTestDocWithId[] = [];
    const unsubscribe = onQuerySnapshot({
      client,
      query: query(col, where("value", "==", 1)),
      getSnapshotData,
      setValue: (value) => {
        latest = value;
      },
    });

    try {
      await waitUntil(() => latest.some((docData) => docData.text === "recreated"));
      test.expect(latest.map((docData) => docData.text)).toEqual(["recreated"]);
    } finally {
      unsubscribe();
    }
  });
});

describe("snapshot acknowledgement metadata", () => {
  it("acknowledges only server snapshots with no pending writes", (test) => {
    test.expect(shouldAcknowledgeSnapshotMetadata({ fromCache: false, hasPendingWrites: false })).toBe(true);
    test.expect(shouldAcknowledgeSnapshotMetadata({ fromCache: true, hasPendingWrites: false })).toBe(false);
    test.expect(shouldAcknowledgeSnapshotMetadata({ fromCache: false, hasPendingWrites: true })).toBe(false);
    test.expect(shouldAcknowledgeSnapshotMetadata({ fromCache: true, hasPendingWrites: true })).toBe(false);
  });
});
