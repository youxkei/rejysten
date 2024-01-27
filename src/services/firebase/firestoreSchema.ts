export type FirestoreSchema = {
  firestoretest: {
    text: string;
    bigram: Record<string, boolean>;
    updatedAt: Date;
  };
};
