import { type CollectionReference, type Timestamp } from "firebase/firestore";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Schema {}

export interface Timestamps {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DocumentData<T extends object> = T & { id: string };

export type SchemaCollectionReference<C extends keyof Schema> = CollectionReference<Schema[C]> & { readonly id: C };

export function widenSchemaCollectionRef<Wide extends keyof Schema, Narrow extends Wide>(
  col: SchemaCollectionReference<Narrow>,
): SchemaCollectionReference<Wide> {
  return col as unknown as SchemaCollectionReference<Wide>;
}

export function extractData<X extends object>(docData: DocumentData<X>): { id: string; data: X } {
  const { id, ...data } = docData;
  return { id, data: data as unknown as X };
}

export function withId<X extends object>(id: string, data: X): DocumentData<X> {
  return { ...data, id } as DocumentData<X>;
}

type EnsureNoPreservedFields<T, PreservedFields extends string> = T extends {
  [K in keyof T]: Omit<T[K], PreservedFields> extends T[K] ? T[K] : never;
}
  ? true
  : false;

true satisfies EnsureNoPreservedFields<Schema, "id" | "meta">;
