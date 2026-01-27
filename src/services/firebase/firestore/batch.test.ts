import {
  type CollectionReference,
  type Firestore,
  collection,
  writeBatch,
  getDoc as getDocOriginal,
  doc,
} from "firebase/firestore";
import { describe, it, vi, beforeAll, afterAll } from "vitest";

import { singletonDocumentId, type Timestamps, type FirestoreService } from "@/services/firebase/firestore";
import { Batch } from "@/services/firebase/firestore/batch";
import { collectionNgramConfig } from "@/services/firebase/firestore/ngram";
import {
  createTestFirestoreService,
  timestampForServerTimestamp,
  timestampForCreatedAt,
} from "@/services/firebase/firestore/test";
import { acquireEmulator, releaseEmulator, getEmulatorPort } from "@/test";

type TestDoc = Timestamps & { text: string; value: number };

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

describe("batch", () => {
  vi.mock(import("firebase/firestore"), async (importOriginal) => {
    const mod = await importOriginal();

    return {
      ...mod,
      serverTimestamp: () => timestampForServerTimestamp,
    };
  });

  describe("updateDoc", () => {
    it("updates document with serverTimestamp", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestore, tid) as CollectionReference<TestDoc>;
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
      const batch = new Batch(service, writeBatch(firestore));
      batch.update(col, {
        id: "testDoc",
        text: "updated text",
        value: 2,
      });
      await batch.commit();

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

      const col = collection(firestore, tid) as CollectionReference<TestDoc>;
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
      const batch = new Batch(service, writeBatch(firestore));
      batch.update(col, {
        id: "testDoc",
        text: "hello world",
        value: 2,
      });
      await batch.commit();

      const ngramDoc = await getDocOriginal(doc(ngramsCol, `testDoc${tid}`));
      test.expect(ngramDoc.exists()).toBe(true);
      test.expect(ngramDoc.data()?.text).toBe("hello world");
      test.expect(ngramDoc.data()?.normalizedText).toBe("hello world");
      test.expect(ngramDoc.data()?.collection).toBe(tid);
    });

    it("partial update preserves existing fields", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestore, tid) as CollectionReference<TestDoc>;
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
      const batch = new Batch(service, writeBatch(firestore));
      batch.update(col, {
        id: "testDoc",
        value: 99,
      });
      await batch.commit();

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

      const col = collection(firestore, tid) as CollectionReference<TestDoc>;
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
      const batch = new Batch(service, writeBatch(firestore));
      batch.updateSingleton(col, {
        text: "updated singleton",
        value: 20,
      });
      await batch.commit();

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

      const col = collection(firestore, tid) as CollectionReference<TestDoc>;
      const batch = new Batch(service, writeBatch(firestore));

      batch.set(col, {
        id: "newDoc",
        text: "new document",
        value: 42,
      });
      await batch.commit();

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

      const col = collection(firestore, tid) as CollectionReference<TestDoc>;
      const ngramsCol = collection(firestore, "ngrams");

      // Enable ngram for this collection
      collectionNgramConfig[tid] = true;

      const batch = new Batch(service, writeBatch(firestore));
      batch.set(col, {
        id: "newDoc",
        text: "hello ngram",
        value: 42,
      });
      await batch.commit();

      const ngramDoc = await getDocOriginal(doc(ngramsCol, `newDoc${tid}`));
      test.expect(ngramDoc.exists()).toBe(true);
      test.expect(ngramDoc.data()?.text).toBe("hello ngram");
      test.expect(ngramDoc.data()?.normalizedText).toBe("hello ngram");
      test.expect(ngramDoc.data()?.collection).toBe(tid);
    });

    it("overwrites existing document", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestore, tid) as CollectionReference<TestDoc>;

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
      const batch2 = new Batch(service, writeBatch(firestore));
      batch2.set(col, {
        id: "existingDoc",
        text: "new text",
        value: 999,
      });
      await batch2.commit();

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

      const col = collection(firestore, tid) as CollectionReference<TestDoc>;
      const batch = new Batch(service, writeBatch(firestore));

      batch.setSingleton(col, {
        text: "singleton content",
        value: 100,
      });
      await batch.commit();

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

      const col = collection(firestore, tid) as CollectionReference<TestDoc>;
      const ngramsCol = collection(firestore, "ngrams");

      // Enable ngram for this collection
      collectionNgramConfig[tid] = true;

      const batch = new Batch(service, writeBatch(firestore));
      batch.setSingleton(col, {
        text: "singleton ngram text",
        value: 200,
      });
      await batch.commit();

      const ngramDoc = await getDocOriginal(doc(ngramsCol, `${singletonDocumentId}${tid}`));
      test.expect(ngramDoc.exists()).toBe(true);
      test.expect(ngramDoc.data()?.text).toBe("singleton ngram text");
      test.expect(ngramDoc.data()?.normalizedText).toBe("singleton ngram text");
      test.expect(ngramDoc.data()?.collection).toBe(tid);
    });
  });
});
