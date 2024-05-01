export type FirestoreSchema = {
  pocFirestoreNgramTest: {
    text: string;
  };

  pocFirestorePubsub: {
    prevId: string;
    nextId: string;
  };

  ngrams: {
    collection: Exclude<keyof FirestoreSchema, "bigrams">;
    text: string;
    ngram: Record<string, boolean>;
  };
};
