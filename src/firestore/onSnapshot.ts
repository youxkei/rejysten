import {
  type DocumentReference,
  type QuerySnapshot,
  Timestamp,
  onSnapshot as firestoreOnSnapshot,
} from "firebase/firestore";

import { type FirestoreClient } from "@/firestore/client";
import { type DocumentWithId, getDocumentWithId } from "@/firestore/document";
import { type QueryWithMetadata } from "@/firestore/query";

export type SnapshotMetadata = {
  fromCache: boolean;
  hasPendingWrites: boolean;
};

export function shouldAcknowledgeSnapshotMetadata(metadata: SnapshotMetadata): boolean {
  return !metadata.fromCache && !metadata.hasPendingWrites;
}

function valuesEqualIgnoringFields(a: unknown, b: unknown, ignoredFields: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a instanceof Timestamp && b instanceof Timestamp) return a.valueOf() === b.valueOf();
  if (a === null || b === null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqualIgnoringFields(a[i], b[i], ignoredFields)) return false;
    }
    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(aObj).filter((key) => !ignoredFields.has(key)),
    ...Object.keys(bObj).filter((key) => !ignoredFields.has(key)),
  ]);

  for (const key of keys) {
    if (!valuesEqualIgnoringFields(aObj[key], bObj[key], ignoredFields)) return false;
  }
  return true;
}

export type OnDocumentSnapshotOptions<T extends object> = {
  client: FirestoreClient;
  ref: DocumentReference<T>;
  setValue: (value: DocumentWithId<T> | undefined) => void;
  timestampPrefix$?: () => string;
};

export type OnQuerySnapshotOptions<T extends object> = {
  client: FirestoreClient;
  query: QueryWithMetadata<T>;
  setValue: (value: DocumentWithId<T>[]) => void;
  onServerSnapshot?: (snapshot: QuerySnapshot<T>) => void;
  allowInitialEmit?: () => boolean;
  timestampPrefix$?: () => string;
};

export function onDocumentSnapshot<T extends object>(
  options: OnDocumentSnapshotOptions<T>,
): () => void {
  const { client, ref, setValue, timestampPrefix$ } = options;
  const { overlay } = client;
  const ignoredFieldsForEquality = client.snapshot?.ignoredFieldsForEquality ?? new Set<string>();
  let docWithId: DocumentWithId<T> | undefined;
  let suppressOverlayEmit = false;
  let hasEmitted = false;
  let lastEmitted: DocumentWithId<T> | undefined;

  function emit(options?: { requireSnapshotOrOverlay?: boolean }): void {
    if (options?.requireSnapshotOrOverlay && docWithId === undefined && !overlay.hasDocumentOverlay(ref.path))
      return;
    const value = overlay.mergeDocument<T>(ref.parent.id, ref.id, docWithId);
    if (hasEmitted && valuesEqualIgnoringFields(lastEmitted, value, ignoredFieldsForEquality)) return;
    hasEmitted = true;
    lastEmitted = value;
    setValue(value);
  }

  // includeMetadataChanges: true so consumers can observe the
  // hasPendingWrites:true -> false transition. Without this, optimistic
  // catch-up logic may miss a server-confirmed snapshot whose data matches the
  // previous local-write snapshot.
  const unsubscribeSnapshot = firestoreOnSnapshot(ref, { includeMetadataChanges: true }, (snapshot) => {
    console.timeStamp(`${timestampPrefix$?.() ?? "no prefix"}: onDocumentSnapshot`);
    docWithId = getDocumentWithId(snapshot);
    if (shouldAcknowledgeSnapshotMetadata(snapshot.metadata)) {
      suppressOverlayEmit = true;
      overlay.acknowledgeDocument(ref.path, docWithId);
      suppressOverlayEmit = false;
    }
    emit();
  });
  const unsubscribeOverlay = overlay.subscribe((change) => {
    if (suppressOverlayEmit || !change.paths.has(ref.path)) return;
    emit();
  });

  emit({ requireSnapshotOrOverlay: true });

  return () => {
    unsubscribeOverlay();
    unsubscribeSnapshot();
  };
}

export function onQuerySnapshot<T extends object>(
  options: OnQuerySnapshotOptions<T>,
): () => void {
  const {
    client,
    query,
    setValue,
    onServerSnapshot,
    allowInitialEmit,
    timestampPrefix$,
  } = options;
  const { overlay } = client;
  const ignoredFieldsForEquality = client.snapshot?.ignoredFieldsForEquality ?? new Set<string>();
  let docWithIds: DocumentWithId<T>[] = [];
  let suppressOverlayEmit = false;
  let hasEmitted = false;
  let lastEmitted: DocumentWithId<T>[] = [];
  let hasReceivedSnapshot = false;

  function emit(): void {
    const value = overlay.mergeQuery<T>(docWithIds, {
      collection: query.collection,
      filters: query.filters,
      orderBys: query.orderBys,
      limit: query.limit,
      hasUntrackedConstraints: query.hasUntrackedConstraints,
    });
    if (hasEmitted && valuesEqualIgnoringFields(lastEmitted, value, ignoredFieldsForEquality)) return;
    hasEmitted = true;
    lastEmitted = value;
    setValue(value);
  }

  const unsubscribeSnapshot = firestoreOnSnapshot(query.query, { includeMetadataChanges: true }, (snapshot) => {
    console.timeStamp(`${timestampPrefix$?.() ?? "no prefix"}: onQuerySnapshot`);
    onServerSnapshot?.(snapshot);
    docWithIds = snapshot.docs.flatMap((docSnap) => {
      const docWithId = getDocumentWithId(docSnap);
      return docWithId === undefined ? [] : [docWithId];
    });
    hasReceivedSnapshot = true;
    if (shouldAcknowledgeSnapshotMetadata(snapshot.metadata)) {
      suppressOverlayEmit = true;
      for (const docSnap of snapshot.docs) {
        const docWithId = getDocumentWithId(docSnap);
        overlay.acknowledgeDocument(docSnap.ref.path, docWithId);
      }
      suppressOverlayEmit = false;
    }
    emit();
  });
  const unsubscribeOverlay = overlay.subscribe((change) => {
    if (!hasReceivedSnapshot && !(allowInitialEmit?.() ?? false)) return;
    if (suppressOverlayEmit || !change.collections.has(query.collection)) return;
    emit();
  });

  if (allowInitialEmit?.() ?? false) {
    emit();
  }

  return () => {
    unsubscribeOverlay();
    unsubscribeSnapshot();
  };
}
