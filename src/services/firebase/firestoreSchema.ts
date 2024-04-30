export type FirestoreSchema = {
  pocFirestoreBigramTest: {
    text: string;
    bigram: Record<string, boolean>;
  };

  pocFirestorePubsub: {
    prevId: string;
    nextId: string;
  };
};
