export interface Schema {}

type EnsureNoPreservedFields<T, PreservedFields extends string> = T extends {
  [K in keyof T]: Omit<T[K], PreservedFields> extends T[K] ? T[K] : never;
}
  ? true
  : false;

true satisfies EnsureNoPreservedFields<Schema, "id" | "meta">;
