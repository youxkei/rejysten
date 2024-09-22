import equals from "fast-deep-equal";
import {
  type CollectionReference,
  type DocumentSnapshot,
  type Transaction,
  collection,
  doc,
  runTransaction as runTransactionOriginal,
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

export async function txGet<T extends object>(
  tx: Transaction,
  col: CollectionReference<T>,
  id: string,
): Promise<DocumentData<T> | undefined> {
  try {
    console.time(`txGet ${col.path}/${id}`);
    return getDocumentData(await tx.get(doc(col, id)));
  } finally {
    console.timeEnd(`txGet ${col.path}/${id}`);
  }
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

export function runTransaction<T>(
  service: FirebaseService,
  updateFunction: (tx: Transaction) => Promise<T>,
): Promise<T | undefined> {
  return runTransactionOriginal(service.firestore, async (tx) => {
    try {
      return await updateFunction(tx);
    } catch (e) {
      if (e instanceof TransactionAborted) {
        return;
      } else {
        throw e;
      }
    }
  });
}

export function runKeyDownTransaction<T>(updateFunction: (tx: Transaction) => Promise<T>) {
  const { firestore } = useFirebaseService();
  const { updateState } = useStoreService();

  return runTransactionOriginal(firestore, async (tx) => {
    try {
      updateState((state) => {
        state.lock.keyDown = true;
      });

      console.time("transaction");
      return await updateFunction(tx);
    } catch (e) {
      if (e instanceof TransactionAborted) {
        return;
      } else {
        throw e;
      }
    } finally {
      console.timeEnd("transaction");
      updateState((state) => {
        state.lock.keyDown = false;
      });
    }
  });
}
