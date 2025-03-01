import { type Timestamp } from "firebase/firestore";

export interface Schema {
  lifeLogs: {
    text: string;

    startAt: Timestamp;
    endAt: Timestamp;

    createdAt: Timestamp;
    updatedAt: Timestamp;
  };
}

type EnsureNoPreservedFields<T, PreservedFields extends string> = T extends {
  [K in keyof T]: Omit<T[K], PreservedFields> extends T[K] ? T[K] : never;
}
  ? true
  : false;

true satisfies EnsureNoPreservedFields<Schema, "id" | "meta">;
