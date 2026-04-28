import { type DocumentReference, Timestamp } from "firebase/firestore";
import { type Accessor, createMemo, createSignal, onCleanup } from "solid-js";

import { createFirestoreClient, hasDocumentSetOverlay, type FirestoreClient } from "@/firestore/client";
import { onDocumentSnapshot, onQuerySnapshot } from "@/firestore/onSnapshot";
import { type QueryWithMetadata } from "@/firestore/query";
import { type DocumentData, type FirestoreService } from "@/services/firebase/firestore";
import { createLatchSignal } from "@/solid/signal";
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

const firestoreClientFallbacks = new WeakMap<FirestoreService, FirestoreClient>();

function getClient(service: FirestoreService): FirestoreClient {
  const client = (service as { firestoreClient?: FirestoreClient }).firestoreClient;
  if (client) return client;

  const cached = firestoreClientFallbacks.get(service);
  if (cached) return cached;

  const fallback = createFirestoreClient(service.firestore);
  firestoreClientFallbacks.set(service, fallback);
  return fallback;
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
        setValue,
        timestampPrefix$,
      });
      onCleanup(unsubscribe);
    },
    undefined,
  );

  const latched$ = createLatchSignal(value$, service.clock$, undefined, { equals: valuesEqualIgnoringServerFields });
  return createMemo(() => latched$(), undefined, { equals: valuesEqualIgnoringServerFields });
}

export function createSubscribeAllSignal<T extends object>(
  service: FirestoreService,
  query$: () => QueryWithMetadata<T> | undefined,
  timestampPrefix$?: () => string,
  options?: {
    allowInitialEmit?: () => boolean;
    allowInitialEmitWhenDocumentHasSetOverlay?: () => { collection: string; id: string } | undefined;
  },
): Accessor<DocumentData<T>[]> & { ready$: Accessor<boolean> } {
  const [hasQuery$, setHasQuery] = createSignal(false);
  const value$ = createSubscribeWithResource(
    () => {
      const q = query$();
      setHasQuery(q !== undefined);
      return { query: q };
    },
    (source, setValue: (value: DocumentData<T>[]) => void) => {
      if (source.query === undefined) {
        setValue([]);
        return;
      }
      const client = getClient(service);
      const unsubscribe = onQuerySnapshot({
        client,
        query: source.query,
        setValue,
        allowInitialEmit: () => {
          if (options?.allowInitialEmit?.()) return true;
          const target = options?.allowInitialEmitWhenDocumentHasSetOverlay?.();
          return target ? hasDocumentSetOverlay(client, `${target.collection}/${target.id}`) : false;
        },
        timestampPrefix$,
      });

      onCleanup(unsubscribe);
    },
    [],
  );
  const latched$ = createLatchSignal(value$, service.clock$, [], {
    equals: valuesEqualIgnoringServerFields,
  });
  const signal$ = createMemo(() => latched$(), [], { equals: valuesEqualIgnoringServerFields });
  return Object.assign(signal$, { ready$: () => hasQuery$() && value$.ready$() });
}
