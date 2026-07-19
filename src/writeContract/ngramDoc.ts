import { analyzeTextForNgrams } from "@/ngram";

// Firestore forbids `.` `%` `_` in field names, so ngram keys stored under
// `ngramMap` are percent-encoded with those three characters escaped to a
// reversible `_XX` form (and `_` itself to `_5F` first, so the escape is
// unambiguous).
export function encodeNgramKeyForFirestore(ngram: string): string {
  return encodeURIComponent(ngram).replace(/_/g, "_5F").replace(/\./g, "_2E").replace(/%/g, "_");
}

export function encodeNgramMapForFirestore(ngramMap: Partial<Record<string, true>>): Partial<Record<string, true>> {
  const encoded: Partial<Record<string, true>> = {};
  for (const key of Object.keys(ngramMap)) {
    encoded[encodeNgramKeyForFirestore(key)] = true;
  }
  return encoded;
}

// Computes the ngram companion document for a text field. Empty text means the
// document should be removed. The ngram doc id concatenates the source id and
// its collection with no separator. This is the Web-side builder (it pulls in
// `@/ngram` → `Intl.Segmenter`/`moji`); the Worker copies an existing ngram doc
// over REST instead of recomputing (see the design doc §「ランタイム制約」).
export function buildNgramDoc(
  colId: string,
  id: string,
  text: string,
):
  | { action: "delete"; ngramId: string }
  | {
      action: "set";
      ngramId: string;
      data: { collection: string; text: string; normalizedText: string; ngramMap: Partial<Record<string, true>> };
    } {
  const ngramId = `${id}${colId}`;

  if (text === "") {
    return { action: "delete", ngramId };
  }

  const { normalizedText, ngramMap } = analyzeTextForNgrams(text);
  return {
    action: "set",
    ngramId,
    data: {
      collection: colId,
      text,
      normalizedText,
      ngramMap: encodeNgramMapForFirestore(ngramMap),
    },
  };
}
