import { doc } from "firebase/firestore";

import { type FirestoreService, type SchemaCollectionReference, getCollection } from ".";
import { type OverlayMutation } from "@/firestore/optimisticOverlay";
import { type Schema } from "@/services/firebase/firestore/schema";
import { type Writer } from "@/services/firebase/firestore/writer";
import { buildNgramDoc, encodeNgramKeyForFirestore, encodeNgramMapForFirestore } from "@/writeContract/ngramDoc";

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

// The ngram encoding helpers now live in the firebase-free writeContract module
// so the Worker can share them; re-exported here to keep every existing
// importer of this path unchanged.
export { encodeNgramKeyForFirestore, encodeNgramMapForFirestore };

export const collectionNgramConfig: Partial<Record<string, true>> = {};

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

  const ngramsCol = getCollection(service, "ngrams");
  const built = buildNgramDoc(colId, id, text);

  if (built.action === "delete") {
    writer.delete(doc(ngramsCol, built.ngramId));
    recordOverlay?.({
      type: "delete",
      batchId: "",
      collection: "ngrams",
      id: built.ngramId,
      path: `ngrams/${built.ngramId}`,
    });
    return;
  }

  writer.set(doc(ngramsCol, built.ngramId), built.data);
  recordOverlay?.({
    type: "set",
    batchId: "",
    collection: "ngrams",
    id: built.ngramId,
    path: `ngrams/${built.ngramId}`,
    data: built.data,
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
