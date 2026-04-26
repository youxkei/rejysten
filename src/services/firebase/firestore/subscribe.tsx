import { type DocumentReference, Timestamp } from "firebase/firestore";
import { type Accessor, createMemo, createSignal, onCleanup } from "solid-js";

import { type FirestoreClient } from "@/firestore/client";
import {
  onDocumentSnapshot,
  onQuerySnapshot,
} from "@/firestore/onSnapshot";
import { type QueryWithMetadata } from "@/firestore/query";
import { type DocumentData, type FirestoreService, getDocumentData } from "@/services/firebase/firestore";
import { createSubscribeWithResource } from "@/solid/subscribe";

export { shouldAcknowledgeSnapshotMetadata } from "@/firestore/onSnapshot";

const ignoredServerFields = new Set(["createdAt", "updatedAt"]);

function valuesEqualIgnoringServerFields(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a instanceof Timestamp && b instanceof Timestamp) return a.valueOf() === b.valueOf();
  if (a === null || b === null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqualIgnoringServerFields(a[i], b[i])) return false;
    }
    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(aObj).filter((key) => !ignoredServerFields.has(key)),
    ...Object.keys(bObj).filter((key) => !ignoredServerFields.has(key)),
  ]);

  for (const key of keys) {
    if (!valuesEqualIgnoringServerFields(aObj[key], bObj[key])) return false;
  }
  return true;
}

const snapshotReadySymbol = Symbol("snapshotReady");

type SnapshotReadyArray = unknown[] & { [snapshotReadySymbol]?: boolean };

function markSnapshotReady<T>(items: T[]): T[] {
  Object.defineProperty(items, snapshotReadySymbol, {
    value: true,
    enumerable: false,
  });
  return items;
}

function getClient(service: FirestoreService): FirestoreClient {
  return (service as { firestoreClient?: FirestoreClient }).firestoreClient ?? {
    firestore: service.firestore,
    overlay: service.overlay,
  };
}

function arraysEqualIgnoringServerFieldsAndSnapshotState(a: unknown, b: unknown): boolean {
  if (
    Array.isArray(a) &&
    Array.isArray(b) &&
    (a as SnapshotReadyArray)[snapshotReadySymbol] !== (b as SnapshotReadyArray)[snapshotReadySymbol]
  ) {
    return false;
  }
  return valuesEqualIgnoringServerFields(a, b);
}

export function createSubscribeSignal<T extends object>(
  service: FirestoreService,
  query$: () => DocumentReference<T> | undefined,
  timestampPrefix$?: () => string,
): Accessor<DocumentData<T> | undefined> {
  const value$ = createSubscribeWithResource(
    () => ({ query: query$() }),
    (source, setValue: (value: DocumentData<T> | undefined) => void) => {
      if (source.query === undefined) {
        setValue(undefined);
        return;
      }
      const unsubscribe = onDocumentSnapshot({
        client: getClient(service),
        ref: source.query,
        getSnapshotData: getDocumentData,
        setValue,
        shouldAcknowledge: () => !service.clock$(),
        timestampPrefix$,
      });
      onCleanup(unsubscribe);
    },
    undefined,
  );

  return createMemo(() => value$(), undefined, { equals: valuesEqualIgnoringServerFields });
}

export function createSubscribeAllSignal<T extends object>(
  service: FirestoreService,
  query$: () => QueryWithMetadata<T> | undefined,
  timestampPrefix$?: () => string,
): Accessor<DocumentData<T>[]> & { ready$: Accessor<boolean> } {
  const [ready$, setReady] = createSignal(false);
  const value$ = createSubscribeWithResource(
    () => {
      const q = query$();
      if (!q) setReady(false);
      return { query: q };
    },
    (source, setValue: (value: DocumentData<T>[]) => void) => {
      setReady(false);
      if (source.query === undefined) {
        setValue([]);
        return;
      }
      const unsubscribe = onQuerySnapshot({
        client: getClient(service),
        query: source.query,
        getSnapshotData: getDocumentData,
        setValue: (value) => {
          setValue(markSnapshotReady(value));
        },
        shouldAcknowledge: () => !service.clock$(),
        onServerSnapshot: () => setReady(true),
        timestampPrefix$,
      });

      onCleanup(unsubscribe);
    },
    [],
  );
  const signal$ = createMemo(() => value$(), [], { equals: arraysEqualIgnoringServerFieldsAndSnapshotState });
  return Object.assign(signal$, { ready$ });
}
