import type { RxQuery, RxDocument } from "rxdb";

import { createMemo, onCleanup } from "solid-js";

import { createSubscribeResource } from "@/solid/subscribe";

export function createSubscribeSignal<T>(
  query: () => RxQuery<any, T> | undefined
) {
  const document$ = createSubscribeResource(
    query,
    (query, setValue: (value: { content: T }) => void) => {
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

export function createSubscribeAllSignal<T, U>(
  query: () => RxQuery<any, RxDocument<T, U>[]> | undefined
) {
  const documents$ = createSubscribeResource(
    query,
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

  const documentsWithRevisions$ = createMemo(
    () =>
      documents$().map((item) => ({
        revision: item.revision,
        item,
      })),
    [],
    {
      equals(lhss, rhss) {
        if (lhss.length !== rhss.length) {
          return false;
        }

        for (const [i, lhs] of lhss.entries()) {
          if (lhs.revision !== rhss[i].revision) {
            return false;
          }
        }

        return true;
      },
    }
  );

  return createMemo(() => documentsWithRevisions$().map(({ item }) => item));
}
