import { doc } from "firebase/firestore";

import { type FirestoreService, type SchemaCollectionReference, getCollection } from ".";
import { analyzeTextForNgrams } from "@/ngram";
import { type OverlayMutation } from "@/services/firebase/firestore/overlay";
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

export function encodeNgramKeyForFirestore(ngram: string): string {
  return encodeURIComponent(ngram).replace(/_/g, "_5F").replace(/\./g, "_2E").replace(/%/g, "_");
}

export function encodeNgramMapForFirestore(
  ngramMap: Partial<Record<string, true>>,
): Partial<Record<string, true>> {
  const encoded: Partial<Record<string, true>> = {};
  for (const key of Object.keys(ngramMap)) {
    encoded[encodeNgramKeyForFirestore(key)] = true;
  }
  return encoded;
}

export function setNgram<C extends keyof Schema>(
  service: FirestoreService,
  writer: Writer,
  col: SchemaCollectionReference<C>,
  id: string,
  text: string,
  recordOverlay?: (mutation: OverlayMutation) => void,
) {
  if (!collectionNgramConfig[col.id]) return;

  const colId = col.id;
  if (colId === "ngrams") return;
  if (text === "") {
    deleteNgram(service, writer, col, id, recordOverlay);
    return;
  }

  const ngramsCol = getCollection(service, "ngrams");
  const { normalizedText, ngramMap } = analyzeTextForNgrams(text);
  const ngramId = `${id}${col.id}`;
  const data = {
    collection: colId,
    text,
    normalizedText,
    ngramMap: encodeNgramMapForFirestore(ngramMap),
  };

  writer.set(doc(ngramsCol, ngramId), data);

  recordOverlay?.({
    type: "set",
    batchId: "",
    collection: "ngrams",
    id: ngramId,
    path: `ngrams/${ngramId}`,
    data,
  });
}

export function deleteNgram<C extends keyof Schema>(
  service: FirestoreService,
  writer: Writer,
  col: SchemaCollectionReference<C>,
  id: string,
  recordOverlay?: (mutation: OverlayMutation) => void,
) {
  if (!collectionNgramConfig[col.id]) return;

  const colId = col.id;
  if (colId === "ngrams") return;

  const ngramsCol = getCollection(service, "ngrams");
  const ngramId = `${id}${col.id}`;
  writer.delete(doc(ngramsCol, ngramId));

  recordOverlay?.({
    type: "delete",
    batchId: "",
    collection: "ngrams",
    id: ngramId,
    path: `ngrams/${ngramId}`,
  });
}
