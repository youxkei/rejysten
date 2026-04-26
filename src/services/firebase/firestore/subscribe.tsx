import {
  type DocumentReference,
  type DocumentSnapshot,
  type QuerySnapshot,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { type Accessor, createMemo, createSignal, onCleanup } from "solid-js";

import { type DocumentData, type FirestoreService, getDocumentData } from "@/services/firebase/firestore";
import { type QueryWithMetadata } from "@/services/firebase/firestore/query";
import { type Schema } from "@/services/firebase/firestore/schema";
import { createLatchSignal } from "@/solid/signal";
import { createSubscribeWithResource } from "@/solid/subscribe";

export function shouldAcknowledgeSnapshotMetadata(metadata: {
  fromCache: boolean;
  hasPendingWrites: boolean;
}): boolean {
  return !metadata.fromCache && !metadata.hasPendingWrites;
}

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
  const snapshot$ = createSubscribeWithResource(
    () => ({ query: query$() }),
    (source, setValue: (value: DocumentSnapshot<T> | undefined) => void) => {
      if (source.query === undefined) {
        setValue(undefined);
        return;
      }
      // includeMetadataChanges: true so we observe the
      // hasPendingWrites:true -> false transition. Without this, the overlay's
      // server-catch-up logic never sees the server-confirmed snapshot when its
      // data matches the previous local-write snapshot.
      const unsubscribe = onSnapshot(source.query, { includeMetadataChanges: true }, (snapshot) => {
        console.timeStamp(`${timestampPrefix$?.() ?? "no prefix"}: createSubscribeSignal onSnapshot`);
        setValue(snapshot);
      });
      onCleanup(unsubscribe);
    },
    undefined,
  );

  const base$ = createLatchSignal(
    () => {
      const ref = query$();
      const snapshot = snapshot$();
      const snapshotData = snapshot ? getDocumentData(snapshot) : undefined;

      if (ref && snapshot && !service.clock$() && shouldAcknowledgeSnapshotMetadata(snapshot.metadata)) {
        service.overlay.acknowledgeDocument(ref.path, snapshotData);
      }

      return { ref, snapshotData };
    },
    service.clock$,
    { ref: undefined, snapshotData: undefined } as {
      ref: DocumentReference<T> | undefined;
      snapshotData: DocumentData<T> | undefined;
    },
    {
      equals: (prev, next) =>
        prev.ref?.path === next.ref?.path && valuesEqualIgnoringServerFields(prev.snapshotData, next.snapshotData),
    },
  );

  return createMemo(
    () => {
      service.overlay.version$();

      const { ref, snapshotData } = base$();
      if (!ref) return undefined;

      const collection = ref.parent.id as keyof Schema;
      return service.overlay.mergeDocument<T>(collection, ref.id, snapshotData);
    },
    undefined,
    { equals: valuesEqualIgnoringServerFields },
  );
}

export function createSubscribeAllSignal<T extends object>(
  service: FirestoreService,
  query$: () => QueryWithMetadata<T> | undefined,
  timestampPrefix$?: () => string,
): Accessor<DocumentData<T>[]> & { ready$: Accessor<boolean> } {
  const [ready$, setReady] = createSignal(false);
  const snapshot$ = createSubscribeWithResource(
    () => {
      const q = query$();
      if (!q) setReady(false);
      return q;
    },
    (source, setValue: (value: QuerySnapshot<T> | undefined) => void) => {
      setReady(false);
      const unsubscribe = onSnapshot(source.query, { includeMetadataChanges: true }, (snapshot) => {
        console.timeStamp(`${timestampPrefix$?.() ?? "no prefix"}: createSubscribeAllSignal onSnapshot`);
        setReady(true);
        setValue(snapshot);
      });

      onCleanup(unsubscribe);
    },
    undefined,
  );

  const base$ = createLatchSignal(
    () => {
      const q = query$();
      const snapshot = snapshot$();
      // snapshot.docs must not have non-existing values
      const snapshotData = snapshot
        ? markSnapshotReady(snapshot.docs.map(getDocumentData) as DocumentData<T>[])
        : [];

      if (snapshot && !service.clock$() && shouldAcknowledgeSnapshotMetadata(snapshot.metadata)) {
        for (const docSnap of snapshot.docs) {
          service.overlay.acknowledgeDocument(docSnap.ref.path, getDocumentData(docSnap));
        }
      }

      return { q, snapshotData };
    },
    service.clock$,
    { q: undefined, snapshotData: [] } as {
      q: QueryWithMetadata<T> | undefined;
      snapshotData: DocumentData<T>[];
    },
    {
      equals: (prev, next) =>
        prev.q?.query === next.q?.query &&
        arraysEqualIgnoringServerFieldsAndSnapshotState(prev.snapshotData, next.snapshotData),
    },
  );

  const signal$ = createMemo(
    () => {
      service.overlay.version$();

      const { q, snapshotData } = base$();
      if (!q) return [];

      return service.overlay.mergeQuery<T>(snapshotData, {
        collection: q.collection,
        filters: q.filters,
        orderBys: q.orderBys,
        limit: q.limit,
        hasUntrackedConstraints: q.hasUntrackedConstraints,
      });
    },
    [],
    { equals: arraysEqualIgnoringServerFieldsAndSnapshotState },
  );
  return Object.assign(signal$, { ready$ });
}
