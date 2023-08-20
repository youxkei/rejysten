import type { RxQuery, RxDocument } from "rxdb";

import { createMemo, onCleanup } from "solid-js";

import { createSubscribeWithResource } from "@/solid/subscribe";

export function createSubscribeSignal<T, U>(query$: () => RxQuery<T, RxDocument<T, U> | null> | undefined) {
  const document$ = createSubscribeWithResource(
    query$,
    (query, setValue: (value: { content: RxDocument<T, U> | null }) => void) => {
      const subscription = query.$.subscribe((result) => {
        setValue({ content: result });
      });

      onCleanup(() => {
        subscription.unsubscribe();
      });
    },
    undefined
  );

  return () => document$()?.content;
}

export function createSubscribeAllSignal<T extends { id: string }, U>(
  query$: () => RxQuery<T, RxDocument<T, U>[]> | undefined
) {
  const documents$ = createSubscribeWithResource(
    query$,
    (query, setValue: (value: RxDocument<T, U>[]) => void) => {
      const subscription = query.$.subscribe((result) => {
        setValue(result);
      });

      onCleanup(() => {
        subscription.unsubscribe();
      });
    },
    []
  );

  const documentsWithIdsRevisions = createMemo(
    () =>
      documents$().map((item) => ({
        id: item.id,
        revision: item.revision,
        item,
      })),
    [],
    {
      equals(prevs, nexts) {
        if (prevs.length !== nexts.length) {
          return false;
        }

        for (const [i, prev] of prevs.entries()) {
          if (prev.id !== nexts[i].id || prev.revision !== nexts[i].revision) {
            return false;
          }
        }

        return true;
      },
    }
  );

  return createMemo(() => documentsWithIdsRevisions().map(({ item }) => item));
}
