import { doc } from "firebase/firestore";

import { type FirestoreService, type SchemaCollectionReference, getCollection } from ".";
import { analyzeTextForNgrams } from "@/ngram";
import { type Schema } from "@/services/firebase/firestore/schema";
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

export function setNgram<C extends keyof Schema>(
  service: FirestoreService,
  writer: Writer,
  col: SchemaCollectionReference<C>,
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

export function deleteNgram<C extends keyof Schema>(
  service: FirestoreService,
  writer: Writer,
  col: SchemaCollectionReference<C>,
  id: string,
) {
  if (!collectionNgramConfig[col.id]) return;

  const colId = col.id;
  if (colId === "ngrams") return;

  const ngramsCol = getCollection(service, "ngrams");
  writer.delete(doc(ngramsCol, `${id}${col.id}`));
}
