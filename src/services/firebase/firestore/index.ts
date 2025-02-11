import equals from "fast-deep-equal";
import { FirebaseError } from "firebase/app";
import {
  type CollectionReference,
  type DocumentSnapshot,
  type Query,
  type Transaction,
  type WriteBatch,
  collection,
  doc,
  getDocFromCache,
  getDocsFromCache,
  writeBatch,
  getDocsFromServer,
  getDocFromServer,
} from "firebase/firestore";

import { useFirebaseService, type FirebaseService } from "@/services/firebase";
import { TransactionAborted } from "@/services/firebase/firestore/error";
import { type Schema } from "@/services/firebase/firestore/schema";
import { useStoreService } from "@/services/store";

export function getCollection<Name extends keyof Schema>(service: FirebaseService, name: Name) {
  return collection(service.firestore, name) as CollectionReference<Schema[Name]>;
}

export type DocumentData<T extends object> = T & { id: string };

export function getDocumentData<T extends object>(documentSnapshot: DocumentSnapshot<T>): DocumentData<T> | undefined {
  const data = documentSnapshot.data();

  if (data === undefined) {
    return undefined;
  }

  return {
    ...data,
    id: documentSnapshot.id,
  };
}

export async function getDoc<T extends object>(
  col: CollectionReference<T>,
  id: string,
): Promise<DocumentData<T> | undefined> {
  try {
    return getDocumentData(await getDocFromCache(doc(col, id)));
  } catch (e) {
    if (e instanceof FirebaseError && e.code == "unavailable") {
      return getDocumentData(await getDocFromServer(doc(col, id)));
    }

    throw e;
  }
}

export async function getDocs<T extends object>(query: Query<T>): Promise<DocumentData<T>[]> {
  try {
    // snapshot.docs must not have non-existing values
    return (await getDocsFromCache(query)).docs.map(getDocumentData) as DocumentData<T>[];
  } catch (e) {
    if (e instanceof FirebaseError && e.code == "unavailable") {
      // snapshot.docs must not have non-existing values
      return (await getDocsFromServer(query)).docs.map(getDocumentData) as DocumentData<T>[];
    }

    throw e;
  }
}

export async function txGet<T extends object>(
  tx: Transaction,
  col: CollectionReference<T>,
  id: string,
): Promise<DocumentData<T> | undefined> {
  return getDocumentData(await tx.get(doc(col, id)));
}

export async function txMustUpdated<T extends object>(
  tx: Transaction,
  col: CollectionReference<T>,
  data: DocumentData<T>,
): Promise<void> {
  const txData = await txGet(tx, col, data.id);
  if (!equals(data, txData)) {
    console.log("txMustUpdated", data, txData);
    throw new TransactionAborted();
  }
}

export async function runBatch(updateFunction: (batch: WriteBatch) => Promise<void>): Promise<void> {
  const { firestore } = useFirebaseService();
  const batch = writeBatch(firestore);

  try {
    console.log("batch start");
    await updateFunction(batch);
    await batch.commit();
  } catch (e) {
    if (e instanceof TransactionAborted) {
      return;
    } else {
      throw e;
    }
  } finally {
    console.log("batch end");
  }
}

export async function runKeyDownBatch(updateFunction: (batch: WriteBatch) => Promise<void>) {
  const { state, updateState } = useStoreService();

  if (state.lock.keyDown) {
    return;
  }

  try {
    updateState((state) => {
      state.lock.keyDown = true;
    });

    await runBatch(updateFunction);
  } finally {
    updateState((state) => {
      state.lock.keyDown = false;
    });
  }
}
