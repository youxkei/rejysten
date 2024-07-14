import type { FirebaseService } from "@/services/firebase";
import type { Schema } from "@/services/firebase/firestore/schema";
import type { CollectionReference, DocumentSnapshot, Transaction } from "firebase/firestore";

import { collection, doc } from "firebase/firestore";

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
  transaction: Transaction,
  col: CollectionReference<T>,
  id: string,
): Promise<DocumentData<T> | undefined> {
  return getDocumentData(await transaction.get(doc(col, id)));
}
