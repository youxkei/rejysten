import { Collections, useCollectionsSignal } from "@/rxdb/collections";

export type ActionContext = {
  collections: Collections;
  now: number;
};

export function createActionContext(collections: Collections, now: number): ActionContext {
  return {
    collections,
    now,
  };
}

export function createActionContextSignal(): () => ActionContext | undefined {
  const collections$ = useCollectionsSignal();

  return () => {
    const collections = collections$();
    if (!collections) return;

    return createActionContext(collections, Date.now());
  };
}
