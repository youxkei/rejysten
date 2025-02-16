import { FirebaseError } from "firebase/app";
import {
  type CollectionReference,
  type DocumentSnapshot,
  type Query,
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
import { initialState, useStoreService } from "@/services/store";

declare module "@/services/store" {
  interface State {
    servicesFirebaseFirestore: {
      lock: boolean;
    };
  }
}

initialState.servicesFirebaseFirestore = {
  lock: false,
};

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

export async function runBatch(updateFunction: (batch: WriteBatch) => Promise<void>): Promise<void> {
  const { state, updateState } = useStoreService();
  const firebase = useFirebaseService();

  if (state.servicesFirebaseFirestore.lock) {
    return;
  }

  try {
    console.timeStamp("batch start");

    updateState((state) => {
      state.servicesFirebaseFirestore.lock = true;
    });

    const batch = writeBatch(firebase.firestore);
    await updateFunction(batch);

    await Promise.race([
      new Promise<void>((resolve) => {
        firebase.resolve = resolve;
      }),
      batch.commit(),
    ]);
  } catch (e) {
    if (e instanceof TransactionAborted) {
      return;
    } else {
      throw e;
    }
  } finally {
    updateState((state) => {
      state.servicesFirebaseFirestore.lock = false;
    });

    console.timeStamp("batch end");
  }
}

export async function runBatchWithLock(updateFunction: (batch: WriteBatch) => Promise<void>) {
  await runBatch(updateFunction);
}
