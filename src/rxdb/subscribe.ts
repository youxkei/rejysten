import type { RxQuery } from "rxdb";

import { createMemo, createResource, onCleanup } from "solid-js";

export function useSubscribe<T, I>(
  query: () => RxQuery<any, T> | undefined,
  initialValue: I,
  equals?: (lhs: T | I, rhs: T | I) => boolean
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

  return createMemo(() => resource().content, initialValue, { equals });
}
