import { type CollectionReference, doc, type WriteBatch } from "firebase/firestore";

import { type FirestoreService, getCollection } from ".";
import { calcBigramMap } from "@/bigram";

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    bigrams: {
      collection: string;
      text: string;
      bigramMap: Partial<Record<string, true>>;
    };
  }
}

export const collectionBigramConfig: Partial<Record<string, true>> = {};

export function setBigram<T>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  id: string,
  text: string,
) {
  if (!collectionBigramConfig[col.id]) return;

  const colId = col.id;
  if (colId === "bigrams") return;

  const bigramsCol = getCollection(service, "bigrams");

  batch.set(doc(bigramsCol, `${id}${col.id}`), {
    collection: colId,
    text,
    bigramMap: calcBigramMap(text),
  });
}
