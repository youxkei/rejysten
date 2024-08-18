import type { Query, QueryDocumentSnapshot, QuerySnapshot } from "firebase/firestore";
import type { Accessor } from "solid-js";

import { onSnapshot } from "firebase/firestore";
import { createMemo, onCleanup } from "solid-js";

import { createSubscribeWithResource } from "@/solid/subscribe";

export function createSubscribeSignal<T>(
  query$: () => Query<T> | undefined,
): Accessor<QueryDocumentSnapshot<T> | undefined> {
  const snapshot$ = createSubscribeWithResource(
    query$,
    (query, setValue: (value: QuerySnapshot<T>) => void) => {
      const unsubscribe = onSnapshot(query, (snapshot) => {
        setValue(snapshot);
      });
      onCleanup(unsubscribe);
    },
    undefined,
  );

  return createMemo(() => {
    const snapshot = snapshot$();
    if (!snapshot || snapshot.docs.length === 0) return undefined;

    return snapshot.docs[0];
  });
}

export function createSubscribeAllSignal<T>(query$: () => Query<T> | undefined): Accessor<QueryDocumentSnapshot<T>[]> {
  const snapshot$ = createSubscribeWithResource(
    query$,
    (query, setValue: (value: QuerySnapshot<T>) => void) => {
      const unsubscribe = onSnapshot(query, (snapshot) => {
        setValue(snapshot);
      });

      onCleanup(unsubscribe);
    },
    undefined,
  );

  return createMemo(() => {
    const snapshot = snapshot$();
    if (!snapshot) return [];

    return snapshot.docs;
  });
}
