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

    startAt: Date;
    endAt: Date;

    createdAt: Date;
    updatedAt: Date;
  };

  lifeLogTreeNodes: {
    text: string;

    parentId: string;
    prevId: string;
    nextId: string;

    createdAt: Date;
    updatedAt: Date;
  };

  ngrams: {
    collection: Exclude<keyof Schema, "ngrams">;
    text: string;
    ngram: Record<string, true>;
  };
};

type EnsureNoPreservedFields<T, PreservedFields extends string> = T extends {
  [K in keyof T]: Omit<T[K], PreservedFields> extends T[K] ? T[K] : never;
}
  ? true
  : false;

const _check: EnsureNoPreservedFields<Schema, "id" | "meta"> = true;
