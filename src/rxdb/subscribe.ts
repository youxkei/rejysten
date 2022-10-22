import type { RxQuery } from "rxdb";

import { createMemo, createResource, onCleanup } from "solid-js";

export function subscribe<T>(
  query: () => RxQuery<any, T> | undefined,
  initialValue?: T,
  isEqual?: (lhs: T | undefined, rhs: T | undefined) => boolean
) {
  let setResource: (value: { content: T }) => void;
  let mutateResource: (value: { content: T }) => void;
  let subscription: any;

  const [resource, { mutate }] = createResource(
    query,
    (query) => {
      subscription = query.$.subscribe((result) => {
        setResource({ content: result });
        setResource = mutateResource;
      });

      return new Promise<{ content: T }>((resolve) => {
        setResource = resolve as (value: { content: T }) => void;
      });
    },
    {
      initialValue:
        initialValue === undefined ? undefined : { content: initialValue },
    }
  );

  mutateResource = mutate;

  onCleanup(() => subscription.unsubscribe());

  return createMemo(
    () => {
      return resource()?.content;
    },
    initialValue,
    {
      equals: isEqual,
    }
  );
}
