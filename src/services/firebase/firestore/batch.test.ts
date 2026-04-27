import {
  type Firestore,
  collection,
  writeBatch,
  runTransaction as firebaseRunTransaction,
  getDoc as getDocOriginal,
  getDocFromServer,
  doc,
  type Timestamp,
} from "firebase/firestore";
import { createRoot, createSignal } from "solid-js";
import { describe, it, vi, beforeAll, afterAll, expect } from "vitest";

import {
  singletonDocumentId,
  type FirestoreService,
  type SchemaCollectionReference,
} from "@/services/firebase/firestore";
import {
  OperationRecordingBatch,
  hasCommitFailureForTest,
  runBatch,
  runTransaction,
  waitForPendingCommitsForTest,
} from "@/services/firebase/firestore/batch";
import "@/services/firebase/firestore/editHistory/schema";
import { collectionNgramConfig } from "@/services/firebase/firestore/ngram";
import { createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import {
  createTestFirestoreService,
  timestampForServerTimestamp,
  timestampForCreatedAt,
} from "@/services/firebase/firestore/test";
import { acquireEmulator, releaseEmulator } from "@/test";

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
let emulatorPort: number;

function testOverlay(testService: FirestoreService) {
  return testService.firestoreClient!.overlay;
}

function createMinimalStoreService(): FirestoreService["services"]["store"] {
  let lock = false;
  return {
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
      fn({
        servicesFirestoreBatch: {
          get lock() {
            return lock;
          },
          set lock(v: boolean) {
            lock = v;
          },
        },
      });
    },
  } as FirestoreService["services"]["store"];
}

async function waitForAssertion(assertion: () => void | Promise<void>, timeoutMs = 3000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  if (lastError instanceof Error) throw lastError;
  if (lastError) throw new Error("Assertion did not pass before timeout");
  await assertion();
}

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
  const result = createTestFirestoreService(emulatorPort, "batch-test");
  const [clock$] = createSignal(false);
  service = {
    ...result,
    clock$,
    setClock: () => undefined,
    batchVersion$: () => undefined,
    services: {
      firebase: {} as FirestoreService["services"]["firebase"],
      store: createMinimalStoreService(),
    },
  } as FirestoreService;
  firestore = result.firestore;
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
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
      const batch = new OperationRecordingBatch(service, wb);
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
      const batch = new OperationRecordingBatch(service, wb);
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

    it("update with empty text deletes generated ngram for configured collection", async (test) => {
      const tid = `${test.task.id}_${Date.now()}`;
      const col = testCollection(firestore, tid);
      const ngramsCol = collection(firestore, "ngrams");
      collectionNgramConfig[tid] = true;

      try {
        const setupBatch = writeBatch(firestore);
        setupBatch.set(doc(col, "testDoc"), {
          text: "searchable",
          value: 1,
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        });
        setupBatch.set(doc(ngramsCol, `testDoc${tid}`), {
          collection: tid,
          text: "searchable",
          normalizedText: "searchable",
          ngramMap: { se: true },
        });
        await setupBatch.commit();

        const wb = writeBatch(firestore);
        const batch = new OperationRecordingBatch(service, wb);
        batch.update(col, {
          id: "testDoc",
          text: "",
        });
        await wb.commit();

        const ngramDoc = await getDocOriginal(doc(ngramsCol, `testDoc${tid}`));
        test.expect(ngramDoc.exists()).toBe(false);
        test
          .expect(batch.overlayMutations.map((m) => `${m.collection}/${m.id}:${m.type}`))
          .toContain(`ngrams/testDoc${tid}:delete`);
      } finally {
        Reflect.deleteProperty(collectionNgramConfig, tid);
      }
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
      const batch = new OperationRecordingBatch(service, wb);
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
      const batch = new OperationRecordingBatch(service, wb);
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
    it("ignores empty document id without recording writes", () => {
      const col = testCollection(firestore, "empty_id_set_docs");
      const wb = writeBatch(firestore);
      const batch = new OperationRecordingBatch(service, wb);

      batch.set(col, {
        id: "",
        text: "ignored",
        value: 0,
      });

      expect(batch.forwardOps).toEqual([]);
      expect(batch.overlayMutations).toEqual([]);
    });

    it("creates new document with timestamps", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);
      const wb = writeBatch(firestore);
      const batch = new OperationRecordingBatch(service, wb);

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
      const batch = new OperationRecordingBatch(service, wb);
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

    it("records overlay mutations for document and generated ngram on set", async (test) => {
      const tid = `${test.task.id}_${Date.now()}`;
      const col = testCollection(firestore, tid);
      collectionNgramConfig[tid] = true;

      try {
        const wb = writeBatch(firestore);
        const batch = new OperationRecordingBatch(service, wb);
        batch.set(col, {
          id: "newDoc",
          text: "hello ngram",
          value: 42,
        });

        expect(batch.overlayMutations.map((m) => `${m.collection}/${m.id}:${m.type}`)).toEqual([
          `${tid}/newDoc:set`,
          `ngrams/newDoc${tid}:set`,
        ]);
      } finally {
        Reflect.deleteProperty(collectionNgramConfig, tid);
      }
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
      const batch2 = new OperationRecordingBatch(service, wb2);
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
      const batch = new OperationRecordingBatch(service, wb);

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
      const batch = new OperationRecordingBatch(service, wb);
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
  describe("OperationRecordingBatch with Transaction backend", () => {
    it("set creates document via transaction", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = testCollection(firestore, tid);

      await firebaseRunTransaction(firestore, async (transaction) => {
        const batch = new OperationRecordingBatch(service, transaction);
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
        const batch = new OperationRecordingBatch(service, transaction);
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
        const batch = new OperationRecordingBatch(service, transaction);
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

        const batch = new OperationRecordingBatch(service, transaction);
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

    it("runs update function with OperationRecordingBatch and Transaction", async (test) => {
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

    it("does not apply optimistic overlay during runTransaction", async (test) => {
      const tid = `${test.task.id}_${Date.now()}`;
      const col = testCollection(firestore, tid);
      const setupBatch = writeBatch(firestore);
      setupBatch.set(doc(col, "txNoOverlay"), {
        text: "before",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
      await setupBatch.commit();

      await runTransaction(
        service,
        async (batch, transaction) => {
          await transaction.get(doc(col, "txNoOverlay"));
          batch.update(col, {
            id: "txNoOverlay",
            text: "after",
            value: 2,
          });

          expect(
            testOverlay(service).mergeDocument(col.id, "txNoOverlay", {
              id: "txNoOverlay",
              text: "before",
              value: 1,
            })?.text,
          ).toBe("before");
        },
        { skipHistory: true },
      );

      const result = await getDocOriginal(doc(col, "txNoOverlay"));
      expect(result.data()?.text).toBe("after");
    });

    it("does not leave overlay behind when runTransaction fails", async (test) => {
      const tid = `${test.task.id}_${Date.now()}`;
      const col = testCollection(firestore, tid);

      await expect(
        runTransaction(
          service,
          async (batch) => {
            batch.set(col, {
              id: "txFailed",
              text: "not committed",
              value: 1,
            });
            throw new Error("tx boom");
          },
          { skipHistory: true },
        ),
      ).rejects.toThrow("tx boom");

      expect(testOverlay(service).mergeDocument(col.id, "txFailed", undefined)).toBeUndefined();
      const result = await getDocOriginal(doc(col, "txFailed"));
      expect(result.exists()).toBe(false);
    });
  });
});

describe("OperationRecordingBatch operation recording", () => {
  it("records set operation as forward op", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);
    const wb = writeBatch(firestore);
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
          firestoreClient: sharedFirestore.firestoreClient,
          clock$,
          setClock: () => undefined,
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

        resolve();
      });
    });
  });

  afterAll(() => {
    disposeRoot?.();
  });

  async function setupEmulator(): Promise<void> {
    await waitForPendingCommitsForTest({ service: sharedSvc, timeoutMs: 2000 });

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

    await waitForAssertion(() => {
      expect(sharedSvc.batchVersion$()?.version).toBe("__INITIAL__");
    });
  }

  it("sequential runBatch calls all commit successfully", { timeout: 30000 }, async () => {
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
      await waitForPendingCommitsForTest({ service: sharedSvc });
    }

    for (let i = 0; i < 5; i++) {
      const d = await getDocOriginal(doc(testCol, `doc${i}`));
      expect(d.exists()).toBe(true);
      expect(d.data()!.text).toBe(`text-${i}`);
    }
  });

  it("rapid runBatch calls without waiting for server sync all commit successfully", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "rapid_docs");

    for (let i = 0; i < 5; i++) {
      await runBatch(
        sharedSvc,
        (batch) => {
          batch.set(testCol, { id: `doc${i}`, text: `text-${i}`, value: i });
          return Promise.resolve();
        },
        { skipHistory: true },
      );
      const version = sharedSvc.batchVersion$()?.version;
      expect(version).toBeDefined();
    }

    await waitForPendingCommitsForTest({ service: sharedSvc });

    for (let i = 0; i < 5; i++) {
      const d = await getDocOriginal(doc(testCol, `doc${i}`));
      expect(d.exists()).toBe(true);
      expect(d.data()!.text).toBe(`text-${i}`);
    }
  });

  it(
    "rapid runBatch calls chain batchVersion through pending overlay without waiting for server sync",
    { timeout: 30000 },
    async () => {
      await setupEmulator();
      const testCol = testCollection(sharedFirestore.firestore, "rapid_overlay_version_docs");

      let previousVersion = "__INITIAL__";
      for (let i = 0; i < 5; i++) {
        await runBatch(
          sharedSvc,
          (batch) => {
            batch.set(testCol, { id: `doc${i}`, text: `text-${i}`, value: i });
            return Promise.resolve();
          },
          { skipHistory: true },
        );

        await waitForAssertion(() => {
          const optimisticVersion = sharedSvc.batchVersion$();
          expect(optimisticVersion?.prevVersion).toBe(previousVersion);
          expect(optimisticVersion?.version).toBeDefined();
          expect(optimisticVersion?.version).not.toBe(previousVersion);
        });
        previousVersion = sharedSvc.batchVersion$()!.version;
      }

      await waitForPendingCommitsForTest({ service: sharedSvc });

      const batchVersionCol = collection(
        sharedFirestore.firestore,
        "batchVersion",
      ) as SchemaCollectionReference<"batchVersion">;
      const persisted = await getDocFromServer(doc(batchVersionCol, singletonDocumentId));
      expect(persisted.data()?.version).toBe(previousVersion);
    },
  );

  it("rapid runBatch calls keep the persisted batchVersion chain linear", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "rapid_version_docs");

    for (let i = 0; i < 5; i++) {
      await runBatch(
        sharedSvc,
        (batch) => {
          batch.set(testCol, { id: `doc${i}`, text: `text-${i}`, value: i });
          return Promise.resolve();
        },
        { skipHistory: true },
      );
    }

    await waitForPendingCommitsForTest({ service: sharedSvc });

    const batchVersionCol = collection(
      sharedFirestore.firestore,
      "batchVersion",
    ) as SchemaCollectionReference<"batchVersion">;
    const persisted = await getDocOriginal(doc(batchVersionCol, singletonDocumentId));
    expect(persisted.data()?.version).toBeDefined();
    expect(persisted.data()?.version).not.toBe("__INITIAL__");
    expect(persisted.data()?.prevVersion).toBeDefined();
    expect(persisted.data()?.prevVersion).not.toBe(persisted.data()?.version);
  });

  it("concurrent runBatch calls without awaiting all commit successfully", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "concurrent_docs");

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        runBatch(
          sharedSvc,
          (batch) => {
            batch.set(testCol, { id: `doc${i}`, text: `text-${i}`, value: i });
            return Promise.resolve();
          },
          { skipHistory: true },
        ),
      ),
    );
    await waitForPendingCommitsForTest({ service: sharedSvc });

    await Promise.all(
      Array.from({ length: 5 }, async (_, i) => {
        const d = await getDocOriginal(doc(testCol, `doc${i}`));
        expect(d.exists()).toBe(true);
        expect(d.data()?.text).toBe(`text-${i}`);
      }),
    );
  });

  it("concurrent runBatch calls with editHistory create every history entry", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "concurrent_history_docs");

    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        runBatch(
          sharedSvc,
          (batch) => {
            batch.set(testCol, { id: `doc${i}`, text: `history-${i}`, value: i });
            return Promise.resolve();
          },
          { description: `concurrent-history-${i}` },
        ),
      ),
    );
    await waitForPendingCommitsForTest({ service: sharedSvc });

    const { getDocs: getDocsOriginal } = await import("firebase/firestore");
    const entries = await getDocsOriginal(collection(sharedFirestore.firestore, "editHistory"));
    const descriptions = entries.docs.map((entry) => String(entry.data().description));
    expect(descriptions).toEqual(
      expect.arrayContaining(["concurrent-history-0", "concurrent-history-1", "concurrent-history-2"]),
    );
  });

  it("sequential runBatch calls produce distinct batchVersions", { timeout: 30000 }, async () => {
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
      await waitForPendingCommitsForTest({ service: sharedSvc });
      versions.push(sharedSvc.batchVersion$()?.version);
    }

    const unique = new Set(versions);
    expect(unique.size).toBe(versions.length);
  });

  it("runBatch with editHistory creates entries for each call", { timeout: 30000 }, async () => {
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
    await getDocOriginal(doc(testCol, "target"));

    for (let i = 0; i < 3; i++) {
      await runBatch(sharedSvc, (batch) => {
        batch.update(testCol, { id: "target", text: `edit-${i}` });
        return Promise.resolve();
      });
      await waitForPendingCommitsForTest({ service: sharedSvc });
      await getDocOriginal(doc(testCol, "target"));
    }

    const editHistoryCol = collection(sharedFirestore.firestore, "editHistory");
    const { getDocs: getDocsOriginal } = await import("firebase/firestore");
    const allEntries = await getDocsOriginal(editHistoryCol);
    expect(allEntries.size).toBeGreaterThanOrEqual(3);
  });

  it("runBatch uses the subscribed batchVersion", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "subscribed_batch_version_docs");
    expect(sharedSvc.batchVersion$()?.version).toBe("__INITIAL__");

    await runBatch(
      sharedSvc,
      (batch) => {
        batch.set(testCol, { id: "subscribedDoc", text: "via-subscription", value: 1 });
        return Promise.resolve();
      },
      { skipHistory: true },
    );
    await waitForPendingCommitsForTest({ service: sharedSvc });

    const d = await getDocOriginal(doc(testCol, "subscribedDoc"));
    expect(d.exists()).toBe(true);
    expect(d.data()!.text).toBe("via-subscription");
  });

  it("uses previous pending overlay data as inverse history old values", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "overlay_inverse_docs");
    const setup = writeBatch(sharedFirestore.firestore);
    setup.set(doc(testCol, "target"), {
      text: "base",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setup.commit();

    const batchId = "overlay-inverse-old-value";
    testOverlay(sharedSvc).apply(batchId, [
      {
        type: "update",
        batchId: "",
        collection: testCol.id,
        id: "target",
        path: `${testCol.id}/target`,
        data: { text: "overlay-only", value: 2 },
      },
    ]);

    try {
      const batch = new OperationRecordingBatch(sharedSvc, writeBatch(sharedFirestore.firestore));
      batch.update(testCol, { id: "target", text: "second", value: 3 });

      await expect(batch.buildInverseOps()).resolves.toEqual([
        {
          type: "update",
          collection: testCol.id,
          id: "target",
          data: { text: "overlay-only", value: 2 },
        },
      ]);
    } finally {
      testOverlay(sharedSvc).rollback(batchId, undefined);
    }
  });

  it("does not use current batch overlay data as inverse history old values", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "current_overlay_inverse_docs");
    const setup = writeBatch(sharedFirestore.firestore);
    setup.set(doc(testCol, "target"), {
      text: "base",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setup.commit();

    const batchId = "current-overlay-inverse-old-value";
    testOverlay(sharedSvc).apply(batchId, [
      {
        type: "update",
        batchId: "",
        collection: testCol.id,
        id: "target",
        path: `${testCol.id}/target`,
        data: { text: "current", value: 2 },
      },
    ]);

    try {
      const batch = new OperationRecordingBatch(sharedSvc, writeBatch(sharedFirestore.firestore), batchId);
      batch.update(testCol, { id: "target", text: "second", value: 3 });

      await expect(batch.buildInverseOps()).resolves.toEqual([
        {
          type: "update",
          collection: testCol.id,
          id: "target",
          data: { text: "base", value: 1 },
        },
      ]);
    } finally {
      testOverlay(sharedSvc).rollback(batchId, undefined);
    }
  });

  it("continues the commit queue after a previous commit failure", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "queue_after_failure_docs");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      testOverlay(sharedSvc).acknowledgeDocument(`${testCol.id}/missing`, { text: "base", value: 0 });
      await expect(
        runBatch(
          sharedSvc,
          (batch) => {
            batch.update(testCol, { id: "missing", text: "forces failure", value: 1 });
            return Promise.resolve();
          },
          { skipHistory: true },
        ),
      ).resolves.toBeUndefined();
      await waitForPendingCommitsForTest({ service: sharedSvc });

      await runBatch(
        sharedSvc,
        (batch) => {
          batch.set(testCol, { id: "afterFailure", text: "committed", value: 2 });
          return Promise.resolve();
        },
        { skipHistory: true },
      );

      await waitForPendingCommitsForTest({ service: sharedSvc });
    } finally {
      consoleError.mockRestore();
    }

    await waitForAssertion(async () => {
      const committed = await getDocFromServer(doc(testCol, "afterFailure"));
      expect(committed.exists()).toBe(true);
      expect(committed.data()?.text).toBe("committed");
    });
    expect(hasCommitFailureForTest(sharedSvc)).toBe(false);
  });

  it("keeps a successful pending history head when another history batch fails", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "partial_history_failure_docs");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await Promise.all([
        runBatch(
          sharedSvc,
          (batch) => {
            batch.set(testCol, { id: "successful", text: "committed", value: 1 });
            return Promise.resolve();
          },
          { description: "partial-success" },
        ),
        runBatch(
          sharedSvc,
          (batch) => {
            batch.update(testCol, { id: "missing", text: "forces failure", value: 2 });
            return Promise.resolve();
          },
          { description: "partial-failure" },
        ),
      ]);
      await waitForPendingCommitsForTest({ service: sharedSvc });

      const committed = await getDocFromServer(doc(testCol, "successful"));
      expect(committed.exists()).toBe(true);

      const { getDocs: getDocsOriginal } = await import("firebase/firestore");
      const entries = await getDocsOriginal(collection(sharedFirestore.firestore, "editHistory"));
      const successEntry = entries.docs.find((entry) => entry.data().description === "partial-success");
      expect(successEntry).toBeTruthy();
      expect(sharedSvc.editHistoryHead$()?.entryId).toBe(successEntry?.id);

      await runBatch(
        sharedSvc,
        (batch) => {
          batch.set(testCol, { id: "afterPartialFailure", text: "after", value: 3 });
          return Promise.resolve();
        },
        { description: "after-partial-failure" },
      );
      await waitForPendingCommitsForTest({ service: sharedSvc });

      const entriesAfter = await getDocsOriginal(collection(sharedFirestore.firestore, "editHistory"));
      const afterEntry = entriesAfter.docs.find((entry) => entry.data().description === "after-partial-failure");
      expect(afterEntry?.data().parentId).toBe(successEntry?.id);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("runTransaction can commit while a runBatch commit is still pending", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "transaction_pending_batch_docs");

    await runBatch(
      sharedSvc,
      (batch) => {
        batch.set(testCol, { id: "fromBatch", text: "batch", value: 1 });
        return Promise.resolve();
      },
      { description: "pending-before-transaction" },
    );

    await runTransaction(
      sharedSvc,
      async (batch) => {
        batch.set(testCol, { id: "fromTransaction", text: "transaction", value: 2 });
      },
      { description: "transaction-during-pending-batch" },
    );
    await waitForPendingCommitsForTest({ service: sharedSvc });

    const fromBatch = await getDocFromServer(doc(testCol, "fromBatch"));
    const fromTransaction = await getDocFromServer(doc(testCol, "fromTransaction"));
    expect(fromBatch.exists()).toBe(true);
    expect(fromTransaction.exists()).toBe(true);
  });

  it("runTransaction retry does not duplicate committed history entries", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "transaction_retry_history_docs");
    const setup = writeBatch(sharedFirestore.firestore);
    setup.set(doc(testCol, "target"), {
      text: "base",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setup.commit();

    let attempts = 0;
    await runTransaction(
      sharedSvc,
      async (batch, transaction) => {
        attempts++;
        const snap = await transaction.get(doc(testCol, "target"));
        if (attempts === 1) {
          const interfering = writeBatch(sharedFirestore.firestore);
          interfering.update(doc(testCol, "target"), {
            text: "interfering",
            value: 2,
            updatedAt: timestampForCreatedAt,
          });
          await interfering.commit();
        }
        batch.update(testCol, {
          id: "target",
          text: `tx-${attempts}`,
          value: (snap.data()?.value ?? 0) + 10,
        });
      },
      { description: "retry-history" },
    );

    expect(attempts).toBeGreaterThan(1);
    const { getDocs: getDocsOriginal } = await import("firebase/firestore");
    const entries = await getDocsOriginal(collection(sharedFirestore.firestore, "editHistory"));
    const retryEntries = entries.docs.filter((entry) => entry.data().description === "retry-history");
    expect(retryEntries).toHaveLength(1);
    expect(sharedSvc.editHistoryHead$()?.entryId).toBe(retryEntries[0].id);
  });

  it(
    "rolls back user, ngram, history, head, and batchVersion overlay after history commit failure",
    { timeout: 30000 },
    async () => {
      await setupEmulator();
      const testCol = testCollection(sharedFirestore.firestore, "history_failure_docs");
      const ngramsCol = collection(sharedFirestore.firestore, "ngrams");
      collectionNgramConfig[testCol.id] = true;
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

      try {
        const setup = writeBatch(sharedFirestore.firestore);
        setup.set(doc(testCol, "target"), {
          text: "searchable",
          value: 1,
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        });
        setup.set(doc(ngramsCol, `target${testCol.id}`), {
          collection: testCol.id,
          text: "searchable",
          normalizedText: "searchable",
          ngramMap: { se: true },
        });
        await setup.commit();
        await getDocOriginal(doc(testCol, "target"));

        const beforeVersion = sharedSvc.batchVersion$()?.version;
        await runBatch(
          sharedSvc,
          (batch) => {
            batch.update(testCol, { id: "target", text: "temporary", value: 2 });
            batch.update(testCol, { id: "missing", text: "forces failure", value: 3 });
            return Promise.resolve();
          },
          { description: "failed-history-batch" },
        );

        expect(
          testOverlay(sharedSvc).mergeDocument(testCol.id, "target", {
            id: "target",
            text: "searchable",
            value: 1,
          })?.text,
        ).toBe("temporary");

        await waitForPendingCommitsForTest({ service: sharedSvc });

        expect(consoleError).toHaveBeenCalled();
        expect(hasCommitFailureForTest(sharedSvc)).toBe(true);
        expect(
          testOverlay(sharedSvc).mergeDocument(testCol.id, "target", {
            id: "target",
            text: "searchable",
            value: 1,
          })?.text,
        ).toBe("searchable");
        expect(
          testOverlay(sharedSvc).mergeDocument("ngrams", `target${testCol.id}`, {
            id: `target${testCol.id}`,
            collection: testCol.id,
            text: "searchable",
            normalizedText: "searchable",
            ngramMap: { se: true },
          })?.text,
        ).toBe("searchable");
        const batchVersionCol = collection(
          sharedFirestore.firestore,
          "batchVersion",
        ) as SchemaCollectionReference<"batchVersion">;
        const serverVersion = await getDocFromServer(doc(batchVersionCol, singletonDocumentId));
        expect(serverVersion.data()?.version).toBe(beforeVersion);
        expect(
          testOverlay(sharedSvc).mergeDocument("batchVersion", singletonDocumentId, {
            id: singletonDocumentId,
            ...serverVersion.data()!,
          })?.version,
        ).toBe(beforeVersion);

        await runBatch(
          sharedSvc,
          (batch) => {
            batch.set(testCol, { id: "afterFailure", text: "committed", value: 4 });
            return Promise.resolve();
          },
          { description: "after-failed-history-batch" },
        );
        await waitForPendingCommitsForTest({ service: sharedSvc });

        const committed = await getDocFromServer(doc(testCol, "afterFailure"));
        expect(committed.exists()).toBe(true);
        expect(hasCommitFailureForTest(sharedSvc)).toBe(false);
      } finally {
        consoleError.mockRestore();
        Reflect.deleteProperty(collectionNgramConfig, testCol.id);
      }
    },
  );

  it(
    "runBatch resolves after rollback when commit rejects without throwing to caller",
    { timeout: 30000 },
    async () => {
      await setupEmulator();
      const testCol = testCollection(sharedFirestore.firestore, "async_reject_docs");
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

      try {
        await expect(
          runBatch(
            sharedSvc,
            (batch) => {
              batch.update(testCol, { id: "missing", text: "optimistic", value: 1 });
              return Promise.resolve();
            },
            { skipHistory: true },
          ),
        ).resolves.toBeUndefined();

        await waitForPendingCommitsForTest({ service: sharedSvc });

        expect(consoleError).toHaveBeenCalled();
        expect(testOverlay(sharedSvc).mergeDocument(testCol.id, "missing", undefined)).toBeUndefined();
      } finally {
        consoleError.mockRestore();
      }
    },
  );

  it(
    "does not apply overlay or leave queued work when updateFunction throws after mutations",
    { timeout: 30000 },
    async () => {
      await setupEmulator();
      const testCol = testCollection(sharedFirestore.firestore, "throw_after_mutation_docs");

      await expect(
        runBatch(
          sharedSvc,
          (batch) => {
            batch.set(testCol, { id: "neverCommitted", text: "optimistic", value: 1 });
            throw new Error("boom");
          },
          { skipHistory: true },
        ),
      ).rejects.toThrow("boom");

      expect(testOverlay(sharedSvc).mergeDocument(testCol.id, "neverCommitted", undefined)).toBeUndefined();
      await waitForPendingCommitsForTest({ service: sharedSvc, timeoutMs: 10 });

      await runBatch(
        sharedSvc,
        (batch) => {
          batch.set(testCol, { id: "afterThrow", text: "committed", value: 2 });
          return Promise.resolve();
        },
        { skipHistory: true },
      );
      await waitForPendingCommitsForTest({ service: sharedSvc });

      const committed = await getDocFromServer(doc(testCol, "afterThrow"));
      expect(committed.exists()).toBe(true);
    },
  );

  it("does not commit and unlocks when the first overlay apply throws", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "overlay_apply_throw_docs");
    const originalApply = testOverlay(sharedSvc).apply;
    const applySpy = vi.spyOn(testOverlay(sharedSvc), "apply").mockImplementationOnce(() => {
      throw new Error("overlay boom");
    });

    try {
      await expect(
        runBatch(
          sharedSvc,
          (batch) => {
            batch.set(testCol, { id: "neverCommitted", text: "optimistic", value: 1 });
            return Promise.resolve();
          },
          { skipHistory: true },
        ),
      ).rejects.toThrow("overlay boom");
      await waitForPendingCommitsForTest({ service: sharedSvc, timeoutMs: 10 });

      const missing = await getDocFromServer(doc(testCol, "neverCommitted"));
      expect(missing.exists()).toBe(false);
    } finally {
      applySpy.mockRestore();
      testOverlay(sharedSvc).apply = originalApply;
    }

    await runBatch(
      sharedSvc,
      (batch) => {
        batch.set(testCol, { id: "afterOverlayThrow", text: "committed", value: 2 });
        return Promise.resolve();
      },
      { skipHistory: true },
    );
    await waitForPendingCommitsForTest({ service: sharedSvc });

    const committed = await getDocFromServer(doc(testCol, "afterOverlayThrow"));
    expect(committed.exists()).toBe(true);
  });

  it("applies user, history, and batchVersion overlay together at commit", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "later_overlay_apply_throw_docs");
    const originalApply = testOverlay(sharedSvc).apply;
    const appliedPathGroups: string[][] = [];
    const applySpy = vi.spyOn(testOverlay(sharedSvc), "apply").mockImplementation((batchId, mutations) => {
      appliedPathGroups.push(mutations.map((mutation) => mutation.path));
      originalApply(batchId, mutations);
    });

    try {
      await runBatch(
        sharedSvc,
        (batch) => {
          batch.set(testCol, { id: "committedDespiteOverlayThrow", text: "committed", value: 1 });
          return Promise.resolve();
        },
        { description: "later-overlay-apply-throw" },
      );
      await waitForPendingCommitsForTest({ service: sharedSvc });

      const committed = await getDocFromServer(doc(testCol, "committedDespiteOverlayThrow"));
      expect(committed.exists()).toBe(true);
      expect(appliedPathGroups.length).toBe(1);
      expect(appliedPathGroups[0]).toEqual(
        expect.arrayContaining([
          `${testCol.id}/committedDespiteOverlayThrow`,
          `editHistoryHead/${singletonDocumentId}`,
          `batchVersion/${singletonDocumentId}`,
        ]),
      );
      expect(appliedPathGroups[0].some((path) => path.startsWith("editHistory/"))).toBe(true);
    } finally {
      applySpy.mockRestore();
    }
  });

  it("waitForPendingCommits timeout resolves while the commit task continues", { timeout: 30000 }, async () => {
    await setupEmulator();
    const testCol = testCollection(sharedFirestore.firestore, "wait_timeout_docs");

    await runBatch(
      sharedSvc,
      (batch) => {
        batch.set(testCol, { id: "eventual", text: "committed", value: 1 });
        return Promise.resolve();
      },
      { skipHistory: true },
    );

    await expect(waitForPendingCommitsForTest({ service: sharedSvc, timeoutMs: 1 })).resolves.toBeUndefined();
    await waitForPendingCommitsForTest({ service: sharedSvc });

    const committed = await getDocFromServer(doc(testCol, "eventual"));
    expect(committed.exists()).toBe(true);
  });
});

describe("buildInverseOps", () => {
  it("builds delete as inverse of set", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;

    const col = testCollection(firestore, tid);
    const wb = writeBatch(firestore);
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
    const batch = new OperationRecordingBatch(service, wb);

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
