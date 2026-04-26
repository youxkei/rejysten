import {
  type DocumentReference,
  type DocumentSnapshot,
  type QuerySnapshot,
  Timestamp,
  onSnapshot as firestoreOnSnapshot,
} from "firebase/firestore";

import { type FirestoreClient } from "@/firestore/client";
import { type QueryWithMetadata } from "@/firestore/query";

export type SnapshotMetadata = {
  fromCache: boolean;
  hasPendingWrites: boolean;
};

export function shouldAcknowledgeSnapshotMetadata(metadata: SnapshotMetadata): boolean {
  return !metadata.fromCache && !metadata.hasPendingWrites;
}

function valuesEqualIgnoringFields(
  a: unknown,
  b: unknown,
  ignoredFields: ReadonlySet<string>,
): boolean {
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

export type OnDocumentSnapshotOptions<T extends object, D extends T & { id: string }> = {
  client: FirestoreClient,
  ref: DocumentReference<T>,
  getSnapshotData: (snapshot: DocumentSnapshot<T>) => D | undefined,
  setValue: (value: D | undefined) => void,
  shouldAcknowledge?: () => boolean,
  timestampPrefix$?: () => string,
};

export type OnQuerySnapshotOptions<T extends object, D extends T & { id: string }> = {
  client: FirestoreClient,
  query: QueryWithMetadata<T>,
  getSnapshotData: (snapshot: DocumentSnapshot<T>) => D | undefined,
  setValue: (value: D[]) => void,
  shouldAcknowledge?: () => boolean,
  onServerSnapshot?: (snapshot: QuerySnapshot<T>) => void,
  timestampPrefix$?: () => string,
};

export function onDocumentSnapshot<T extends object, D extends T & { id: string }>(
  options: OnDocumentSnapshotOptions<T, D>,
): () => void {
  const { client, ref, getSnapshotData, setValue, shouldAcknowledge, timestampPrefix$ } = options;
  const { overlay } = client;
  const ignoredFieldsForEquality = client.snapshot?.ignoredFieldsForEquality ?? new Set<string>();
  let snapshotData: D | undefined;
  let suppressOverlayEmit = false;
  let hasEmitted = false;
  let lastEmitted: D | undefined;

  function emit(options?: { skipInitialUndefined?: boolean }): void {
    const value = overlay.mergeDocument<T>(ref.parent.id, ref.id, snapshotData) as D | undefined;
    if (options?.skipInitialUndefined && value === undefined) return;
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
    snapshotData = getSnapshotData(snapshot);
    if ((shouldAcknowledge?.() ?? true) && shouldAcknowledgeSnapshotMetadata(snapshot.metadata)) {
      suppressOverlayEmit = true;
      overlay.acknowledgeDocument(ref.path, snapshotData);
      suppressOverlayEmit = false;
    }
    emit();
  });
  const unsubscribeOverlay = overlay.subscribe((change) => {
    if (suppressOverlayEmit || !change.paths.has(ref.path)) return;
    emit();
  });

  emit({ skipInitialUndefined: true });

  return () => {
    unsubscribeOverlay();
    unsubscribeSnapshot();
  };
}

export function onQuerySnapshot<T extends object, D extends T & { id: string }>(
  options: OnQuerySnapshotOptions<T, D>,
): () => void {
  const {
    client,
    query,
    getSnapshotData,
    setValue,
    shouldAcknowledge,
    onServerSnapshot,
    timestampPrefix$,
  } = options;
  const { overlay } = client;
  const ignoredFieldsForEquality = client.snapshot?.ignoredFieldsForEquality ?? new Set<string>();
  let snapshotData: D[] = [];
  let suppressOverlayEmit = false;
  let hasEmitted = false;
  let lastEmitted: D[] = [];

  function emit(options?: { skipInitialEmpty?: boolean }): void {
    const value = overlay.mergeQuery<T>(snapshotData, {
      collection: query.collection,
      filters: query.filters,
      orderBys: query.orderBys,
      limit: query.limit,
      hasUntrackedConstraints: query.hasUntrackedConstraints,
    }) as D[];
    if (options?.skipInitialEmpty && value.length === 0) return;
    if (hasEmitted && valuesEqualIgnoringFields(lastEmitted, value, ignoredFieldsForEquality)) return;
    hasEmitted = true;
    lastEmitted = value;
    setValue(value);
  }

  const unsubscribeSnapshot = firestoreOnSnapshot(query.query, { includeMetadataChanges: true }, (snapshot) => {
    console.timeStamp(`${timestampPrefix$?.() ?? "no prefix"}: onQuerySnapshot`);
    onServerSnapshot?.(snapshot);
    snapshotData = snapshot.docs.flatMap((docSnap) => {
      const data = getSnapshotData(docSnap);
      return data === undefined ? [] : [data];
    });
    if ((shouldAcknowledge?.() ?? true) && shouldAcknowledgeSnapshotMetadata(snapshot.metadata)) {
      suppressOverlayEmit = true;
      for (const docSnap of snapshot.docs) {
        overlay.acknowledgeDocument(docSnap.ref.path, getSnapshotData(docSnap));
      }
      suppressOverlayEmit = false;
    }
    emit();
  });
  const unsubscribeOverlay = overlay.subscribe((change) => {
    if (suppressOverlayEmit || !change.collections.has(query.collection)) return;
    emit();
  });

  emit({ skipInitialEmpty: true });

  return () => {
    unsubscribeOverlay();
    unsubscribeSnapshot();
  };
}
