import { type CollectionReference, doc, type WriteBatch } from "firebase/firestore";

import { type FirestoreService, getCollection } from ".";
import { calcNgramMap } from "@/ngram";

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    ngrams: {
      collection: string;
      text: string;
      ngramMap: Partial<Record<string, true>>;
    };
  }
}

export const collectionNgramConfig: Partial<Record<string, true>> = {};

export function setNgram<T>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  id: string,
  text: string,
) {
  if (!collectionNgramConfig[col.id]) return;

  const colId = col.id;
  if (colId === "ngrams") return;

  const ngramsCol = getCollection(service, "ngrams");

  batch.set(doc(ngramsCol, `${id}${col.id}`), {
    collection: colId,
    text,
    ngramMap: calcNgramMap(text),
  });
}
