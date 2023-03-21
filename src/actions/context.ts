import { Collections, useCollectionsSignal } from "@/rxdb/collections";

export type ActionContext = {
  collections: Collections;
  updateTime: Date;
};

export function createActionContext(collections: Collections): ActionContext {
  return {
    collections,
    updateTime: new Date(),
  };
}

export function createActionContextSignal(): () => ActionContext | undefined {
  const collections$ = useCollectionsSignal();

  return () => {
    const collections = collections$();
    if (!collections) return;

    return createActionContext(collections);
  };
}
