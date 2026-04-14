import {
  type Firestore,
  collection,
  writeBatch,
  runTransaction as firebaseRunTransaction,
  getDoc as getDocOriginal,
  doc,
  onSnapshotsInSync,
  type Timestamp,
} from "firebase/firestore";
import { createComputed, createRoot, createSignal } from "solid-js";
import { describe, it, vi, beforeAll, afterAll, expect } from "vitest";

import {
  singletonDocumentId,
  type FirestoreService,
  type SchemaCollectionReference,
  waitForServerSync,
} from "@/services/firebase/firestore";
import { Batch, runBatch, runTransaction } from "@/services/firebase/firestore/batch";
import "@/services/firebase/firestore/editHistory/schema";
import { collectionNgramConfig } from "@/services/firebase/firestore/ngram";
import { createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import {
  createTestFirestoreService,
  timestampForServerTimestamp,
  timestampForCreatedAt,
} from "@/services/firebase/firestore/test";
import { acquireEmulator, releaseEmulator, getEmulatorPort } from "@/test";

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    __test__: { text: string; value: number; createdAt: Timestamp; updatedAt: Timestamp };
  }
}

function testCollection(fs: Firestore, name: string): SchemaCollectionReference<"__test__"> {
  return collection(fs, name) as SchemaCollectionReference<"__test__">;
}

let service: FirestoreService;
let firestore: Firestore;

beforeAll(async () => {
  await acquireEmulator();
  const emulatorPort = await getEmulatorPort();
  const result = createTestFirestoreService(emulatorPort, "batch-test");
  service = result as FirestoreService;
  firestore = result.firestore;
});

afterAll(async () => {
  await releaseEmulator();
});

vi.mock(import("firebase/firestore"), async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    serverTimestamp: () => timestampForServerTimestamp,
  };
});

describe("batch", () => {
  describe("updateDoc", () => {
    it("updates document with serverTimestamp", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const setupBatch = writeBatch(firestore);

      // First create a document
      const docRef = doc(col, "testDoc");
      setupBatch.set(docRef, {
        text: "initial text",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      // Update the document
      const wb = writeBatch(firestore);
      const batch = new Batch(service, wb);
      batch.update(col, {
        id: "testDoc",
        text: "updated text",
        value: 2,
      });
      await wb.commit();

      const updatedDoc = await getDocOriginal(doc(col, "testDoc"));
      test.expect(updatedDoc.data()).toEqual({
        text: "updated text",
        value: 2,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
    });

    it("updates document with ngram when text field exists and collection is configured", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const ngramsCol = collection(firestore, "ngrams");

      // Enable ngram for this collection
      collectionNgramConfig[tid] = true;

      const setupBatch = writeBatch(firestore);

      // First create a document
      const docRef = doc(col, "testDoc");
      setupBatch.set(docRef, {
        text: "initial text",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      // Update the document
      const wb = writeBatch(firestore);
      const batch = new Batch(service, wb);
      batch.update(col, {
        id: "testDoc",
        text: "hello world",
        value: 2,
      });
      await wb.commit();

      const ngramDoc = await getDocOriginal(doc(ngramsCol, `testDoc${tid}`));
      test.expect(ngramDoc.exists()).toBe(true);
      test.expect(ngramDoc.data()?.text).toBe("hello world");
      test.expect(ngramDoc.data()?.normalizedText).toBe("hello world");
      test.expect(ngramDoc.data()?.collection).toBe(tid);
    });

    it("partial update preserves existing fields", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const setupBatch = writeBatch(firestore);

      // First create a document
      const docRef = doc(col, "testDoc");
      setupBatch.set(docRef, {
        text: "initial text",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      // Update only the value field
      const wb = writeBatch(firestore);
      const batch = new Batch(service, wb);
      batch.update(col, {
        id: "testDoc",
        value: 99,
      });
      await wb.commit();

      const updatedDoc = await getDocOriginal(doc(col, "testDoc"));
      test.expect(updatedDoc.data()).toEqual({
        text: "initial text",
        value: 99,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
    });
  });

  describe("updateSingletonDoc", () => {
    it("updates singleton document", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const setupBatch = writeBatch(firestore);

      // First create a singleton document
      const docRef = doc(col, singletonDocumentId);
      setupBatch.set(docRef, {
        text: "singleton text",
        value: 10,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      // Update the singleton document
      const wb = writeBatch(firestore);
      const batch = new Batch(service, wb);
      batch.updateSingleton(col, {
        text: "updated singleton",
        value: 20,
      });
      await wb.commit();

      const updatedDoc = await getDocOriginal(doc(col, singletonDocumentId));
      test.expect(updatedDoc.data()).toEqual({
        text: "updated singleton",
        value: 20,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
    });
  });

  describe("setDoc", () => {
    it("creates new document with timestamps", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const wb = writeBatch(firestore);
      const batch = new Batch(service, wb);

      batch.set(col, {
        id: "newDoc",
        text: "new document",
        value: 42,
      });
      await wb.commit();

      const newDoc = await getDocOriginal(doc(col, "newDoc"));
      test.expect(newDoc.data()).toEqual({
        text: "new document",
        value: 42,
        createdAt: timestampForServerTimestamp,
        updatedAt: timestampForServerTimestamp,
      });
    });

    it("creates document with ngram when text field exists and collection is configured", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const ngramsCol = collection(firestore, "ngrams");

      // Enable ngram for this collection
      collectionNgramConfig[tid] = true;

      const wb = writeBatch(firestore);
      const batch = new Batch(service, wb);
      batch.set(col, {
        id: "newDoc",
        text: "hello ngram",
        value: 42,
      });
      await wb.commit();

      const ngramDoc = await getDocOriginal(doc(ngramsCol, `newDoc${tid}`));
      test.expect(ngramDoc.exists()).toBe(true);
      test.expect(ngramDoc.data()?.text).toBe("hello ngram");
      test.expect(ngramDoc.data()?.normalizedText).toBe("hello ngram");
      test.expect(ngramDoc.data()?.collection).toBe(tid);
    });

    it("overwrites existing document", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);

      // First create a document
      const batch1 = writeBatch(firestore);
      const docRef = doc(col, "existingDoc");
      batch1.set(docRef, {
        text: "old text",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await batch1.commit();

      // Set (overwrite) the document
      const wb2 = writeBatch(firestore);
      const batch2 = new Batch(service, wb2);
      batch2.set(col, {
        id: "existingDoc",
        text: "new text",
        value: 999,
      });
      await wb2.commit();

      const existingDoc = await getDocOriginal(doc(col, "existingDoc"));
      test.expect(existingDoc.data()).toEqual({
        text: "new text",
        value: 999,
        createdAt: timestampForServerTimestamp,
        updatedAt: timestampForServerTimestamp,
      });
    });
  });

  describe("setSingletonDoc", () => {
    it("creates singleton document", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const wb = writeBatch(firestore);
      const batch = new Batch(service, wb);

      batch.setSingleton(col, {
        text: "singleton content",
        value: 100,
      });
      await wb.commit();

      const singletonDoc = await getDocOriginal(doc(col, singletonDocumentId));
      test.expect(singletonDoc.data()).toEqual({
        text: "singleton content",
        value: 100,
        createdAt: timestampForServerTimestamp,
        updatedAt: timestampForServerTimestamp,
      });
    });

    it("creates singleton document with ngram when text field exists and collection is configured", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const ngramsCol = collection(firestore, "ngrams");

      // Enable ngram for this collection
      collectionNgramConfig[tid] = true;

      const wb = writeBatch(firestore);
      const batch = new Batch(service, wb);
      batch.setSingleton(col, {
        text: "singleton ngram text",
        value: 200,
      });
      await wb.commit();

      const ngramDoc = await getDocOriginal(doc(ngramsCol, `${singletonDocumentId}${tid}`));
      test.expect(ngramDoc.exists()).toBe(true);
      test.expect(ngramDoc.data()?.text).toBe("singleton ngram text");
      test.expect(ngramDoc.data()?.normalizedText).toBe("singleton ngram text");
      test.expect(ngramDoc.data()?.collection).toBe(tid);
    });
  });
});

describe("transaction", () => {
  describe("Batch with Transaction backend", () => {
    it("set creates document via transaction", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);

      await firebaseRunTransaction(firestore, async (transaction) => {
        const batch = new Batch(service, transaction);
        batch.set(col, {
          id: "txDoc",
          text: "transaction doc",
          value: 77,
        });
      });

      const created = await getDocOriginal(doc(col, "txDoc"));
      test.expect(created.data()).toEqual({
        text: "transaction doc",
        value: 77,
        createdAt: timestampForServerTimestamp,
        updatedAt: timestampForServerTimestamp,
      });
    });

    it("update modifies document via transaction", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const setupBatch = writeBatch(firestore);
      setupBatch.set(doc(col, "txDoc"), {
        text: "original",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      await firebaseRunTransaction(firestore, async (transaction) => {
        const batch = new Batch(service, transaction);
        batch.update(col, {
          id: "txDoc",
          text: "updated via tx",
          value: 2,
        });
      });

      const updated = await getDocOriginal(doc(col, "txDoc"));
      test.expect(updated.data()).toEqual({
        text: "updated via tx",
        value: 2,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
    });

    it("delete removes document via transaction", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const setupBatch = writeBatch(firestore);
      setupBatch.set(doc(col, "txDoc"), {
        text: "to delete",
        value: 0,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      await firebaseRunTransaction(firestore, async (transaction) => {
        const batch = new Batch(service, transaction);
        batch.delete(col, "txDoc");
      });

      const deleted = await getDocOriginal(doc(col, "txDoc"));
      test.expect(deleted.exists()).toBe(false);
    });

    it("transaction can read and write atomically", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const setupBatch = writeBatch(firestore);
      setupBatch.set(doc(col, "txDoc"), {
        text: "start",
        value: 10,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      await firebaseRunTransaction(firestore, async (transaction) => {
        const snap = await transaction.get(doc(col, "txDoc"));
        const currentValue = snap.data()!.value;

        const batch = new Batch(service, transaction);
        batch.update(col, {
          id: "txDoc",
          value: currentValue + 5,
        });
      });

      const result = await getDocOriginal(doc(col, "txDoc"));
      test.expect(result.data()!.value).toBe(15);
    });
  });

  describe("runTransaction helper", () => {
    it("runTransaction creates editHistory entry when not skipped", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const setupBatch = writeBatch(firestore);
      setupBatch.set(doc(col, "histDoc"), {
        text: "before",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      await runTransaction(
        service,
        async (batch, transaction) => {
          const snap = await transaction.get(doc(col, "histDoc"));
          const currentValue = snap.data()!.value;

          batch.update(col, {
            id: "histDoc",
            text: "after-tx",
            value: currentValue + 1,
          });
        },
        { description: "トランザクション操作" },
      );

      const editHistoryCol = collection(firestore, "editHistory");
      const { getDocs: getDocsOriginal } = await import("firebase/firestore");
      const allEntries = await getDocsOriginal(editHistoryCol);
      const txEntry = allEntries.docs.find((d) => d.data().description === "トランザクション操作");
      test.expect(txEntry).toBeTruthy();
      test.expect((txEntry!.data().operations as unknown[]).length).toBeGreaterThan(0);
    });

    it("runTransaction skips editHistory with skipHistory", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const setupBatch = writeBatch(firestore);
      setupBatch.set(doc(col, "skipDoc"), {
        text: "before",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      await runTransaction(
        service,
        async (batch, transaction) => {
          const snap = await transaction.get(doc(col, "skipDoc"));
          const currentValue = snap.data()!.value;

          batch.update(col, {
            id: "skipDoc",
            text: "after-skip",
            value: currentValue + 1,
          });
        },
        { skipHistory: true },
      );

      const editHistoryCol = collection(firestore, "editHistory");
      const { getDocs: getDocsOriginal } = await import("firebase/firestore");
      const allEntries = await getDocsOriginal(editHistoryCol);
      const skipEntry = allEntries.docs.find((d) => {
        const ops = d.data().operations as { id?: string }[];
        return ops.some((op) => op.id === "skipDoc");
      });
      test.expect(skipEntry).toBeUndefined();
    });

    it("runs update function with Batch and Transaction", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const setupBatch = writeBatch(firestore);
      setupBatch.set(doc(col, "helperDoc"), {
        text: "before",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      await runTransaction(service, async (batch, transaction) => {
        const snap = await transaction.get(doc(col, "helperDoc"));
        const currentValue = snap.data()!.value;

        batch.update(col, {
          id: "helperDoc",
          text: "after",
          value: currentValue + 100,
        });
      });

      const result = await getDocOriginal(doc(col, "helperDoc"));
      test.expect(result.data()).toEqual({
        text: "after",
        value: 101,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
    });
  });
});

describe("Batch operation recording", () => {
  it("records set operation as forward op", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);
    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    batch.set(col, {
      id: "newDoc",
      text: "hello",
      value: 1,
    });

    expect(batch.forwardOps).toEqual([
      {
        type: "set",
        collection: tid,
        id: "newDoc",
        data: { text: "hello", value: 1 },
      },
    ]);
  });

  it("records update operation as forward op", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "testDoc"), {
      text: "original",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    batch.update(col, {
      id: "testDoc",
      text: "updated",
    });

    expect(batch.forwardOps).toEqual([
      {
        type: "update",
        collection: tid,
        id: "testDoc",
        data: { text: "updated" },
      },
    ]);
  });

  it("records delete operation as forward op", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);
    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    batch.delete(col, "someDoc");

    expect(batch.forwardOps).toEqual([
      {
        type: "delete",
        collection: tid,
        id: "someDoc",
      },
    ]);
  });

  it("does not record operations on excluded collections", () => {
    const batchVersionCol = testCollection(firestore, "batchVersion");
    const editHistoryCol = testCollection(firestore, "editHistory");
    const editHistoryHeadCol = testCollection(firestore, "editHistoryHead");
    const ngramsCol = testCollection(firestore, "ngrams");

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    batch.set(batchVersionCol, { id: "doc1", text: "a", value: 1 });
    batch.set(editHistoryCol, { id: "doc2", text: "b", value: 2 });
    batch.set(editHistoryHeadCol, { id: "doc3", text: "c", value: 3 });
    batch.set(ngramsCol, { id: "doc4", text: "d", value: 4 });

    expect(batch.forwardOps).toEqual([]);
  });

  it("records multiple operations in order", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "existingDoc"), {
      text: "existing",
      value: 10,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    batch.set(col, { id: "newDoc", text: "new", value: 1 });
    batch.update(col, { id: "existingDoc", text: "changed" });
    batch.delete(col, "deleteDoc");

    expect(batch.forwardOps).toHaveLength(3);
    expect(batch.forwardOps[0].type).toBe("set");
    expect(batch.forwardOps[1].type).toBe("update");
    expect(batch.forwardOps[2].type).toBe("delete");
  });
});

describe("runBatch stability", () => {
  let sharedSvc: FirestoreService;
  let sharedFirestore: ReturnType<typeof createTestFirestoreService>;
  let disposeRoot: (() => void) | undefined;

  beforeAll(async () => {
    const emulatorPort = await getEmulatorPort();
    sharedFirestore = createTestFirestoreService(emulatorPort, "runbatch-stability", { useMemoryCache: true });

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        disposeRoot = dispose;

        const batchVersionCol = collection(
          sharedFirestore.firestore,
          "batchVersion",
        ) as SchemaCollectionReference<"batchVersion">;
        const editHistoryHeadCol = collection(
          sharedFirestore.firestore,
          "editHistoryHead",
        ) as SchemaCollectionReference<"editHistoryHead">;

        const [clock$] = createSignal(false);
        let lock = false;

        sharedSvc = {
          firestore: sharedFirestore.firestore,
          clock$,
          setClock: () => undefined,
          resolve: undefined,
          batchVersion$: () => undefined,
          editHistoryHead$: () => undefined,
          services: {
            firebase: {} as FirestoreService["services"]["firebase"],
            store: {
              state: {
                servicesFirestoreBatch: {
                  get lock() {
                    return lock;
                  },
                  set lock(v: boolean) {
                    lock = v;
                  },
                },
              },
              updateState: (fn: (s: { servicesFirestoreBatch: { lock: boolean } }) => void) => {
                fn(sharedSvc.services.store.state);
              },
            } as FirestoreService["services"]["store"],
          },
        };

        sharedSvc.batchVersion$ = createSubscribeSignal(sharedSvc, () => doc(batchVersionCol, singletonDocumentId));
        sharedSvc.editHistoryHead$ = createSubscribeSignal(sharedSvc, () =>
          doc(editHistoryHeadCol, singletonDocumentId),
        );

        onSnapshotsInSync(sharedFirestore.firestore, () => {
          sharedSvc.resolve?.();
          sharedSvc.resolve = undefined;
        });

        resolve();
      });
    });
  });

  afterAll(() => {
    disposeRoot?.();
  });

  async function setupEmulator(): Promise<void> {
    const emulatorPort = await getEmulatorPort();
    await fetch(`http://localhost:${emulatorPort}/emulator/v1/projects/demo/databases/(default)/documents`, {
      method: "DELETE",
    });

    const batchVersionCol = collection(
      sharedFirestore.firestore,
      "batchVersion",
    ) as SchemaCollectionReference<"batchVersion">;
    const setupBatch = writeBatch(sharedFirestore.firestore);
    setupBatch.set(doc(batchVersionCol, singletonDocumentId), {
      version: "__INITIAL__",
      prevVersion: "",
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    await new Promise<void>((resolve) => {
      createComputed(() => {
        if (sharedSvc.batchVersion$()?.version === "__INITIAL__") {
          resolve();
        }
      });
    });
  }

  it("sequential runBatch calls all commit successfully", { timeout: 15000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "sequential_docs");

    for (let i = 0; i < 5; i++) {
      await runBatch(
        sharedSvc,
        (batch) => {
          batch.set(testCol, { id: `doc${i}`, text: `text-${i}`, value: i });
          return Promise.resolve();
        },
        { skipHistory: true },
      );
      await waitForServerSync(sharedSvc);
    }

    for (let i = 0; i < 5; i++) {
      const d = await getDocOriginal(doc(testCol, `doc${i}`));
      expect(d.exists()).toBe(true);
      expect(d.data()!.text).toBe(`text-${i}`);
    }
  });

  it("sequential runBatch calls produce distinct batchVersions", { timeout: 15000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "distinct_docs");
    const versions: (string | undefined)[] = [];

    for (let i = 0; i < 5; i++) {
      await runBatch(
        sharedSvc,
        (batch) => {
          batch.set(testCol, { id: `doc${i}`, text: `text-${i}`, value: i });
          return Promise.resolve();
        },
        { skipHistory: true },
      );
      await waitForServerSync(sharedSvc);
      versions.push(sharedSvc.batchVersion$()?.version);
    }

    const unique = new Set(versions);
    expect(unique.size).toBe(versions.length);
  });

  it("runBatch with editHistory creates entries for each call", { timeout: 15000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "edithistory_docs");

    const sb = writeBatch(sharedFirestore.firestore);
    sb.set(doc(testCol, "target"), {
      text: "initial",
      value: 0,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await sb.commit();
    await waitForServerSync(sharedSvc);
    await getDocOriginal(doc(testCol, "target"));

    for (let i = 0; i < 3; i++) {
      await runBatch(sharedSvc, (batch) => {
        batch.update(testCol, { id: "target", text: `edit-${i}` });
        return Promise.resolve();
      });
      await waitForServerSync(sharedSvc);
      await getDocOriginal(doc(testCol, "target"));
    }

    const editHistoryCol = collection(sharedFirestore.firestore, "editHistory");
    const { getDocs: getDocsOriginal } = await import("firebase/firestore");
    const allEntries = await getDocsOriginal(editHistoryCol);
    expect(allEntries.size).toBeGreaterThanOrEqual(3);
  });

  it("runBatch falls back to server read when batchVersion$ is undefined", { timeout: 15000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "fallback_docs");

    const originalBatchVersion$ = sharedSvc.batchVersion$;
    sharedSvc.batchVersion$ = () => undefined;

    await runBatch(
      sharedSvc,
      (batch) => {
        batch.set(testCol, { id: "fallbackDoc", text: "via-fallback", value: 1 });
        return Promise.resolve();
      },
      { skipHistory: true },
    );
    await waitForServerSync(sharedSvc);

    const d = await getDocOriginal(doc(testCol, "fallbackDoc"));
    expect(d.exists()).toBe(true);
    expect(d.data()!.text).toBe("via-fallback");

    sharedSvc.batchVersion$ = originalBatchVersion$;
  });
});

describe("buildInverseOps", () => {
  it("builds delete as inverse of set", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);
    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    batch.set(col, { id: "newDoc", text: "hello", value: 42 });
    const inverseOps = await batch.buildInverseOps();

    expect(inverseOps).toEqual([{ type: "delete", collection: tid, id: "newDoc" }]);
  });

  it("builds update with old values as inverse of update", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);

    // Create doc first and ensure it's in cache
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "testDoc"), {
      text: "old",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    // Read to populate cache
    await getDocOriginal(doc(col, "testDoc"));

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    batch.update(col, { id: "testDoc", text: "new" });
    const inverseOps = await batch.buildInverseOps();

    expect(inverseOps).toEqual([
      {
        type: "update",
        collection: tid,
        id: "testDoc",
        data: { text: "old" },
      },
    ]);
  });

  it("builds set with full old data as inverse of delete", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);

    // Create doc first
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "testDoc"), {
      text: "hello",
      value: 42,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    // Read to populate cache
    await getDocOriginal(doc(col, "testDoc"));

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    batch.delete(col, "testDoc");
    const inverseOps = await batch.buildInverseOps();

    expect(inverseOps).toEqual([
      {
        type: "set",
        collection: tid,
        id: "testDoc",
        data: { text: "hello", value: 42 },
      },
    ]);
  });

  it("builds inverse ops in reverse order", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    batch.set(col, { id: "doc1", text: "a", value: 1 });
    batch.set(col, { id: "doc2", text: "b", value: 2 });
    batch.set(col, { id: "doc3", text: "c", value: 3 });

    const inverseOps = await batch.buildInverseOps();

    expect(inverseOps).toHaveLength(3);
    expect(inverseOps[0].id).toBe("doc3");
    expect(inverseOps[1].id).toBe("doc2");
    expect(inverseOps[2].id).toBe("doc1");
  });

  it("handles mixed set/update/delete in one batch", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);

    // Create docs for update and delete
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "updateDoc"), {
      text: "before",
      value: 10,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    setupBatch.set(doc(col, "deleteDoc"), {
      text: "toDelete",
      value: 99,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    // Populate cache
    await getDocOriginal(doc(col, "updateDoc"));
    await getDocOriginal(doc(col, "deleteDoc"));

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    batch.set(col, { id: "newDoc", text: "created", value: 1 });
    batch.update(col, { id: "updateDoc", text: "after" });
    batch.delete(col, "deleteDoc");

    const inverseOps = await batch.buildInverseOps();

    // Reversed order: delete inverse, update inverse, set inverse
    expect(inverseOps).toHaveLength(3);
    expect(inverseOps[0]).toEqual({
      type: "set",
      collection: tid,
      id: "deleteDoc",
      data: { text: "toDelete", value: 99 },
    });
    expect(inverseOps[1]).toEqual({
      type: "update",
      collection: tid,
      id: "updateDoc",
      data: { text: "before" },
    });
    expect(inverseOps[2]).toEqual({
      type: "delete",
      collection: tid,
      id: "newDoc",
    });
  });

  it("handles cache miss gracefully for update", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    // Use a collection name that has never been read — doc won't be in cache
    const col = testCollection(firestore, tid);

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    // Update a doc that doesn't exist in cache
    batch.update(col, { id: "nonCachedDoc", text: "new" });
    const inverseOps = await batch.buildInverseOps();

    // Should return empty — can't build inverse without cached data
    expect(inverseOps).toEqual([]);
  });

  it("handles cache miss gracefully for delete", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    // Delete a doc that doesn't exist in cache
    batch.delete(col, "nonCachedDoc");
    const inverseOps = await batch.buildInverseOps();

    // Should return empty — can't build inverse without cached data
    expect(inverseOps).toEqual([]);
  });

  it("builds partial inverse when some docs have cache miss", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

    // set: always has inverse (delete), no cache needed
    batch.set(col, { id: "newDoc", text: "hello", value: 1 });
    // update: doc not in cache → inverse skipped
    batch.update(col, { id: "uncachedUpdateDoc", text: "updated" });
    // delete: doc not in cache → inverse skipped
    batch.delete(col, "uncachedDeleteDoc");

    const inverseOps = await batch.buildInverseOps();

    // Only the set's inverse (delete) should be present
    expect(inverseOps).toEqual([{ type: "delete", collection: tid, id: "newDoc" }]);
  });
});
