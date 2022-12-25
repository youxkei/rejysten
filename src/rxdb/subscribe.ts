import type { RxQuery, RxDocument } from "rxdb";

import { createMemo, createResource, onCleanup } from "solid-js";

function useSubscribeBase<T, I>(
  query: () => RxQuery<any, T> | undefined,
  initialValue: I
) {
  let setResource: (value: { content: T }) => void;
  let mutateResource: (value: { content: T }) => void;

  const [resource, { mutate }] = createResource<
    { content: T | I },
    RxQuery<any, T>,
    unknown
  >(
    query,
    (query) => {
      const subscription = query.$.subscribe((result) => {
        setResource({ content: result });
        setResource = mutateResource;
      });

      onCleanup(() => {
        subscription?.unsubscribe();
      });

      return new Promise<{ content: T | I }>((resolve) => {
        setResource = resolve as (value: { content: T }) => void;
      });
    },
    {
      initialValue: { content: initialValue },
    }
  );

  mutateResource = mutate;

  return createMemo(() => resource().content, initialValue, { equals: false });
}

export function useSubscribe<T>(query: () => RxQuery<any, T> | undefined) {
  return useSubscribeBase(query, null);
}

export function useSubscribeAll<T, U>(
  query: () => RxQuery<any, RxDocument<T, U>[]> | undefined
) {
  const items = useSubscribeBase(query, []);

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
