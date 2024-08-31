import equals from "fast-deep-equal";
import {
  type CollectionReference,
  type DocumentSnapshot,
  type Transaction,
  collection,
  doc,
  runTransaction as runTransactionOriginal,
} from "firebase/firestore";

import { type FirebaseService } from "@/services/firebase";
import { TransactionAborted } from "@/services/firebase/firestore/error";
import { type Schema } from "@/services/firebase/firestore/schema";

export function getCollection<Name extends keyof Schema>(service: FirebaseService, name: Name) {
  return collection(service.firestore, name) as CollectionReference<Schema[Name]>;
}

export type DocumentData<T> = T & { id: string };

export function getDocumentData<T>(documentSnapshot: DocumentSnapshot<T>): DocumentData<T> | undefined {
  const data = documentSnapshot.data();

  if (data === undefined) {
    return undefined;
  }

  return {
    ...data,
    id: documentSnapshot.id,
  };
}

export async function txGet<T>(
  tx: Transaction,
  col: CollectionReference<T>,
  id: string,
): Promise<DocumentData<T> | undefined> {
  return getDocumentData(await tx.get(doc(col, id)));
}

export async function txMustUpdated<T>(
  tx: Transaction,
  col: CollectionReference<T>,
  data: DocumentData<T>,
): Promise<void> {
  const txData = await txGet(tx, col, data.id);
  if (!equals(data, txData)) {
    throw new TransactionAborted();
  }
}

export function runTransaction<T>(
  service: FirebaseService,
  updateFunction: (tx: Transaction) => Promise<T>,
): Promise<void> {
  return runTransactionOriginal(service.firestore, async (tx) => {
    try {
      await updateFunction(tx);
    } catch (e) {
      if (e instanceof TransactionAborted) {
        return;
      } else {
        throw e;
      }
    }
  });
}
