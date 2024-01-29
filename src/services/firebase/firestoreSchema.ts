export type FirestoreSchema = {
  pocFirestoreTest: {
    text: string;
    bigram: Record<string, boolean>;
    updatedAt: Date;
  };

  pocFirestorePubsub: {
    prevId: string;
    nextId: string;
  };
};
