import { type CollectionReference, doc } from "firebase/firestore";

import { type FirestoreService, getCollection } from ".";
import { analyzeTextForNgrams } from "@/ngram";
import { type Writer } from "@/services/firebase/firestore/writer";

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
  writer: Writer,
  col: CollectionReference<T>,
  id: string,
  text: string,
) {
  if (!collectionNgramConfig[col.id]) return;

  const colId = col.id;
  if (colId === "ngrams") return;

  const ngramsCol = getCollection(service, "ngrams");
  const { normalizedText, ngramMap } = analyzeTextForNgrams(text);

  writer.set(doc(ngramsCol, `${id}${col.id}`), {
    collection: colId,
    text,
    normalizedText,
    ngramMap,
  });
}

export function deleteNgram<T>(service: FirestoreService, writer: Writer, col: CollectionReference<T>, id: string) {
  if (!collectionNgramConfig[col.id]) return;

  const colId = col.id;
  if (colId === "ngrams") return;

  const ngramsCol = getCollection(service, "ngrams");
  writer.delete(doc(ngramsCol, `${id}${col.id}`));
}
