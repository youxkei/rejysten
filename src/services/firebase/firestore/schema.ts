import type { Timestamp } from "firebase/firestore";

export type Schema = {
  pocFirestoreNgram: {
    text: string;
  };

  pocFirestorePubsub: {
    prevId: string;
    nextId: string;
  };

  pocFirestoreSubcollection: {
    text: string;
  };

  lifeLogs: {
    text: string;

    startAt: Timestamp;
    endAt: Timestamp;

    createdAt: Timestamp;
    updatedAt: Timestamp;
  };

  lifeLogTreeNodes: {
    text: string;

    parentId: string;
    prevId: string;
    nextId: string;

    createdAt: Timestamp;
    updatedAt: Timestamp;
  };

  ngrams: {
    collection: Exclude<keyof Schema, "ngrams">;
    text: string;
    ngram: Record<string, true>;

    createdAt: Timestamp;
    updatedAt: Timestamp;
  };
};

type EnsureNoPreservedFields<T, PreservedFields extends string> = T extends {
  [K in keyof T]: Omit<T[K], PreservedFields> extends T[K] ? T[K] : never;
}
  ? true
  : false;

true satisfies EnsureNoPreservedFields<Schema, "id" | "meta">;
