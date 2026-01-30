import {
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
  onSnapshot,
} from "firebase/firestore";
import { type Accessor, onCleanup } from "solid-js";

import { type DocumentData, type FirestoreService, getDocumentData } from "@/services/firebase/firestore";
import { createLatchSignal } from "@/solid/signal";
import { createSubscribeWithResource } from "@/solid/subscribe";

export function createSubscribeSignal<T extends object>(
  service: FirestoreService,
  query$: () => DocumentReference<T> | undefined,
  timestampPrefix$?: () => string,
): Accessor<DocumentData<T> | undefined> {
  const snapshot$ = createSubscribeWithResource(
    () => ({ query: query$() }),
    (source, setValue: (value: DocumentSnapshot<T> | undefined) => void) => {
      if (source.query === undefined) {
        setValue(undefined);
        return;
      }
      const unsubscribe = onSnapshot(source.query, (snapshot) => {
        console.timeStamp(`${timestampPrefix$?.() ?? "no prefix"}: createSubscribeSignal onSnapshot`);
        setValue(snapshot);
      });
      onCleanup(unsubscribe);
    },
    undefined,
  );

  return createLatchSignal(
    () => {
      const snapshot = snapshot$();
      if (!snapshot) return undefined;

      return getDocumentData(snapshot);
    },
    service.clock$,
    undefined,
  );
}

export function createSubscribeAllSignal<T extends object>(
  service: FirestoreService,
  query$: () => Query<T> | undefined,
  timestampPrefix$?: () => string,
): Accessor<DocumentData<T>[]> {
  const snapshot$ = createSubscribeWithResource(
    () => ({ query: query$() }),
    (source, setValue: (value: QuerySnapshot<T> | undefined) => void) => {
      if (source.query === undefined) {
        setValue(undefined);
        return;
      }
      const unsubscribe = onSnapshot(source.query, (snapshot) => {
        console.timeStamp(`${timestampPrefix$?.() ?? "no prefix"}: createSubscribeAllSignal onSnapshot`);
        setValue(snapshot);
      });

      onCleanup(unsubscribe);
    },
    undefined,
  );

  return createLatchSignal(
    () => {
      const snapshot = snapshot$();
      if (!snapshot) return [];

      // snapshot.docs must not have non-existing values
      return snapshot.docs.map(getDocumentData) as DocumentData<T>[];
    },
    service.clock$,
    [],
  );
}
