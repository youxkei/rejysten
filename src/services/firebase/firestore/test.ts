import {
  type CollectionReference,
  setDoc,
  doc,
  Timestamp,
  initializeFirestore,
  persistentLocalCache,
  connectFirestoreEmulator,
  collection,
  type Query,
} from "firebase/firestore";

import { getDoc as getDocOriginal, getDocs as getDocsOriginal, type FirestoreService } from ".";
import { type Schema } from "@/services/firebase/firestore/schema";
import { firebaseServiceForTest } from "@/services/firebase/test";

function crateFirestoreServiceForTest() {
  const firestore = initializeFirestore(firebaseServiceForTest.firebaseApp, { localCache: persistentLocalCache() });

  connectFirestoreEmulator(firestore, "localhost", 8080);

  return { firestore };
}

export const serviceForTest = crateFirestoreServiceForTest() as FirestoreService;
export const firestoreForTest = serviceForTest.firestore;

export function getCollectionForTest<Name extends keyof Schema>(name: Name, postfix: string) {
  return collection(firestoreForTest, `${name}_${postfix}`) as CollectionReference<Schema[Name]>;
}

export async function getDoc<T extends object>(col: CollectionReference<T>, id: string) {
  return (await getDocOriginal(serviceForTest, col, id))!;
}

export async function getDocs<T extends object>(query: Query<T>) {
  return getDocsOriginal(serviceForTest, query);
}

export async function setDocs<T extends { text: string }>(col: CollectionReference<T>, treeNodes: T[]) {
  for (const treeNode of treeNodes) {
    await setDoc(doc(col, treeNode.text), treeNode);
  }
}

export const timestampForCreatedAt = Timestamp.fromDate(new Date("2123-04-05T06:07:08+09:00"));
export const timestampForServerTimestamp = Timestamp.fromDate(new Date("2345-06-07T08:09:10+09:00"));
