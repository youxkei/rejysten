import {
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
  onSnapshot,
} from "firebase/firestore";
import { type Accessor, createMemo, onCleanup } from "solid-js";

import { type DocumentData, getDocumentData } from "@/services/firebase/firestore";
import { createSubscribeWithResource } from "@/solid/subscribe";

export function createSubscribeSignal<T extends object>(
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

export function createSubscribeAllSignal<T extends object>(
  query$: () => Query<T> | undefined,
): Accessor<DocumentData<T>[]> {
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
