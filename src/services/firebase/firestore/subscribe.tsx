import type { DocumentData } from "@/services/firebase/firestore";
import type { DocumentReference, DocumentSnapshot, Query, QuerySnapshot } from "firebase/firestore";
import type { Accessor } from "solid-js";

import { onSnapshot } from "firebase/firestore";
import { createMemo, onCleanup } from "solid-js";

import { getDocumentData } from "@/services/firebase/firestore";
import { createSubscribeWithResource } from "@/solid/subscribe";

export function createSubscribeSignal<T>(
  query$: () => DocumentReference<T> | undefined,
): Accessor<DocumentData<T> | undefined> {
  const snapshot$ = createSubscribeWithResource(
    query$,
    (query, setValue: (value: DocumentSnapshot<T>) => void) => {
      const unsubscribe = onSnapshot(query, (snapshot) => {
        setValue(snapshot);
      });
      onCleanup(unsubscribe);
    },
    undefined,
  );

  return createMemo(() => {
    const snapshot = snapshot$();
    if (!snapshot) return;

    return getDocumentData(snapshot);
  });
}

export function createSubscribeAllSignal<T>(query$: () => Query<T> | undefined): Accessor<DocumentData<T>[]> {
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

    // snapshot.docs must not have non-existing values
    return snapshot.docs.map(getDocumentData) as DocumentData<T>[];
  });
}
