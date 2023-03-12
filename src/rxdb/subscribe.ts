import type { RxQuery, RxDocument } from "rxdb";

import { createMemo, onCleanup } from "solid-js";

import { createSubscribeResource } from "@/solid/subscribe";

export function useSubscribe<T>(query: () => RxQuery<any, T> | undefined) {
  const resource = createSubscribeResource(
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

  return () => resource()?.content;
}

export function useSubscribeAll<T, U>(
  query: () => RxQuery<any, RxDocument<T, U>[]> | undefined
) {
  const items = createSubscribeResource(
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

  const itemsWithRevisions = createMemo(
    () =>
      items().map((item) => ({
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

  return createMemo(() => itemsWithRevisions().map(({ item }) => item));
}
