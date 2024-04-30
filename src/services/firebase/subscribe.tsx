import type { Query, QuerySnapshot } from "firebase/firestore";

import { onSnapshot } from "firebase/firestore";
import { createMemo, onCleanup } from "solid-js";

import { createSubscribeWithResource } from "@/solid/subscribe";

export function createSubscribeAllSignal<T>(query$: () => Query<T> | undefined) {
  const snapshot$ = createSubscribeWithResource(
    query$,
    (query, setValue: (value: QuerySnapshot<T>) => void) => {
      const unsubscribe = onSnapshot(query, (snapshot) => {
        setValue(snapshot);
      });

      onCleanup(unsubscribe);
    },
    undefined
  );

  return createMemo(() => {
    const snapshot = snapshot$();
    if (!snapshot) return [];

    return snapshot.docs;
  });
}
