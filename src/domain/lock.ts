import {
  CollectionNameToDocumentType,
  useCollectionsSignal,
} from "@/rxdb/collections";
import { createSubscribeSignal } from "@/rxdb/subscribe";
import { createMemo } from "solid-js";

export type Lock = CollectionNameToDocumentType["locks"];

export function createLockSignal() {
  const collections$ = useCollectionsSignal();

  return createSubscribeSignal(() => collections$()?.locks.findOne("lock"));
}

export function createSignalWithLock<T>(value$: () => T, initialValue: T) {
  const lock$ = createLockSignal();

  const valueNotUpdatedWhenLocked$ = createMemo(
    () => {
      const lock = lock$();
      if (!lock || lock.isLocked) {
        return { preventUpdate: true, value: initialValue };
      }

      return { preventUpdate: false, value: value$() };
    },
    { preventUpdate: false, value: initialValue },
    { equals: (_, next) => next.preventUpdate }
  );

  return () => valueNotUpdatedWhenLocked$().value;
}
