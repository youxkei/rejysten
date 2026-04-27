import { getApps, initializeApp } from "firebase/app";
import {
  type CollectionReference,
  type DocumentSnapshot,
  type Firestore,
  Timestamp,
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  writeBatch,
} from "firebase/firestore";

import { type DocumentWithId, getDocumentWithId } from "@/firestore/document";

export type FirestoreTestDoc = {
  text: string;
  value: number;
  tags?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type FirestoreTestDocWithId = DocumentWithId<FirestoreTestDoc>;

export const timestampForCreatedAt = Timestamp.fromDate(new Date("2123-04-05T06:07:08+09:00"));

export function createTestFirestore(emulatorPort: number, appName: string): Firestore {
  let app = getApps().find((candidate) => candidate.name === appName);
  if (!app) {
    app = initializeApp({ projectId: "demo" }, appName);
  }

  try {
    const firestore = initializeFirestore(app, { localCache: memoryLocalCache() });
    connectFirestoreEmulator(firestore, "localhost", emulatorPort);
    return firestore;
  } catch {
    return getFirestore(app);
  }
}

export function testCollection(
  firestore: Firestore,
  name: string,
): CollectionReference<FirestoreTestDoc> & { readonly id: string } {
  return collection(firestore, name) as CollectionReference<FirestoreTestDoc> & { readonly id: string };
}

export function getSnapshotData<T extends object>(snapshot: DocumentSnapshot<T>): (T & { id: string }) | undefined {
  return getDocumentWithId(snapshot);
}

export async function seedDocs(
  col: CollectionReference<FirestoreTestDoc>,
  docs: Record<string, FirestoreTestDoc>,
): Promise<void> {
  const batch = writeBatch(col.firestore);
  for (const [id, data] of Object.entries(docs)) {
    batch.set(doc(col, id), {
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
      ...data,
    });
  }
  await batch.commit();
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for predicate");
    }
    await wait(20);
  }
}
