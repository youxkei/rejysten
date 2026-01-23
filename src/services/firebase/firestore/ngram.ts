import { type CollectionReference, doc, type WriteBatch } from "firebase/firestore";

import { type FirestoreService, getCollection } from ".";
import { analyzeTextForNgrams } from "@/ngram";

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    ngrams: {
      collection: string;
      text: string;
      normalizedText: string;
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
  const { normalizedText, ngramMap } = analyzeTextForNgrams(text);

  batch.set(doc(ngramsCol, `${id}${col.id}`), {
    collection: colId,
    text,
    normalizedText,
    ngramMap,
  });
}

export function deleteNgram<T>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  id: string,
) {
  if (!collectionNgramConfig[col.id]) return;

  const colId = col.id;
  if (colId === "ngrams") return;

  const ngramsCol = getCollection(service, "ngrams");
  batch.delete(doc(ngramsCol, `${id}${col.id}`));
}
