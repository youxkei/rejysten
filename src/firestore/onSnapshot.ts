import {
  type DocumentReference,
  type QuerySnapshot,
  Timestamp,
  getDocFromCache,
  getDocsFromCache,
  onSnapshot as firestoreOnSnapshot,
} from "firebase/firestore";

import { type FirestoreClient } from "@/firestore/client";
import { type DocumentWithId, getDocumentWithId } from "@/firestore/document";
import { type QueryWithMetadata } from "@/firestore/query";
import { lastActionLink, withCurrentSpan, withSpan } from "@/telemetry/span";

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

function toDocumentWithIds<T extends object>(snapshot: QuerySnapshot<T>): DocumentWithId<T>[] {
  return snapshot.docs.flatMap((docSnap) => {
    const docWithId = getDocumentWithId(docSnap);
    return docWithId === undefined ? [] : [docWithId];
  });
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

export function onDocumentSnapshot<T extends object>(options: OnDocumentSnapshotOptions<T>): () => void {
  const { client, ref, setValue, timestampPrefix$ } = options;
  const { overlay } = client;
  const ignoredFieldsForEquality = client.snapshot?.ignoredFieldsForEquality ?? new Set<string>();
  let docWithId: DocumentWithId<T> | undefined;
  let suppressOverlayEmit = false;
  let hasEmitted = false;
  let lastEmitted: DocumentWithId<T> | undefined;
  let hasReceivedSnapshot = false;
  let disposed = false;

  function emit(options?: { requireSnapshotOrOverlay?: boolean }): void {
    if (options?.requireSnapshotOrOverlay && docWithId === undefined && !overlay.hasDocumentOverlay(ref.path)) return;
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
    // Snapshots fire outside any action lifetime; record them as their own
    // roots linked to the most recent action so a write's echo stays findable.
    const link = lastActionLink();
    withSpan(
      "snapshot.onDocumentSnapshot",
      (span) => {
        withCurrentSpan(span, () => {
          docWithId = getDocumentWithId(snapshot);
          hasReceivedSnapshot = true;
          if (shouldAcknowledgeSnapshotMetadata(snapshot.metadata)) {
            suppressOverlayEmit = true;
            overlay.acknowledgeDocument(ref.path, docWithId);
            suppressOverlayEmit = false;
          }
          emit();
        });
      },
      {
        root: true,
        links: link ? [link] : undefined,
        attributes: {
          "app.collection": ref.parent.id,
          "app.doc_id": ref.id,
          "app.from_cache": snapshot.metadata.fromCache,
          "app.has_pending_writes": snapshot.metadata.hasPendingWrites,
          "app.timestamp_prefix": timestampPrefix$?.(),
        },
      },
    );
  });
  const unsubscribeOverlay = overlay.subscribe((change) => {
    if (suppressOverlayEmit || !change.paths.has(ref.path)) return;
    emit();
  });

  emit({ requireSnapshotOrOverlay: true });

  // Seed the initial value from the local cache so a stalled watch stream does
  // not block a document that is cached but not yet in the overlay (e.g. a node
  // remounted at a new location by a tree move). A cached doc may be stale (e.g.
  // deleted server-side while offline); the live snapshot reconciles it. Cache
  // data is not server-confirmed, so we do not acknowledge. The rejection
  // handler covers only the cache read (getDocFromCache rejects when the doc is
  // absent) — an error thrown by emit must not be swallowed.
  void getDocFromCache(ref).then(
    (snapshot) => {
      if (disposed || hasReceivedSnapshot) return;
      docWithId = getDocumentWithId(snapshot);
      emit({ requireSnapshotOrOverlay: true });
    },
    () => {
      // Not in cache — fall back to the live snapshot.
    },
  );

  return () => {
    disposed = true;
    unsubscribeOverlay();
    unsubscribeSnapshot();
  };
}

export function onQuerySnapshot<T extends object>(options: OnQuerySnapshotOptions<T>): () => void {
  const { client, query, setValue, onServerSnapshot, allowInitialEmit, timestampPrefix$ } = options;
  const { overlay } = client;
  const ignoredFieldsForEquality = client.snapshot?.ignoredFieldsForEquality ?? new Set<string>();
  let docWithIds: DocumentWithId<T>[] = [];
  let suppressOverlayEmit = false;
  let hasEmitted = false;
  let lastEmitted: DocumentWithId<T>[] = [];
  let hasReceivedSnapshot = false;
  let disposed = false;

  function emit(options?: { traced?: boolean }): void {
    const mergeQuery = () =>
      overlay.mergeQuery<T>(docWithIds, {
        collection: query.collection,
        filters: query.filters,
        orderBys: query.orderBys,
        limit: query.limit,
        hasUntrackedConstraints: query.hasUntrackedConstraints,
      });
    // The cache seed merges outside any snapshot span, so skip the
    // overlay.mergeQuery span for it — that span is meant to attribute merge cost
    // to a snapshot delivery, and emitting it here would create an orphan
    // (parentless) span. All other callers run inside a snapshot span.
    const value =
      options?.traced === false
        ? mergeQuery()
        : withSpan("overlay.mergeQuery", mergeQuery, {
            attributes: { "app.collection": query.collection, "app.doc_count": docWithIds.length },
          });
    if (hasEmitted && valuesEqualIgnoringFields(lastEmitted, value, ignoredFieldsForEquality)) return;
    hasEmitted = true;
    lastEmitted = value;
    setValue(value);
  }

  const unsubscribeSnapshot = firestoreOnSnapshot(
    query.query,
    { includeMetadataChanges: true },
    (snapshot) => {
      // Snapshots fire outside any action lifetime; record them as their own
      // roots linked to the most recent action so a write's echo stays findable.
      const link = lastActionLink();
      withSpan(
        "snapshot.onQuerySnapshot",
        (span) => {
          withCurrentSpan(span, () => {
            onServerSnapshot?.(snapshot);
            docWithIds = toDocumentWithIds(snapshot);
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
        },
        {
          root: true,
          links: link ? [link] : undefined,
          attributes: {
            "app.collection": query.collection,
            "app.doc_count": snapshot.docs.length,
            "app.from_cache": snapshot.metadata.fromCache,
            "app.has_pending_writes": snapshot.metadata.hasPendingWrites,
            "app.timestamp_prefix": timestampPrefix$?.(),
          },
        },
      );
    },
    (error) => {
      // Without this handler a failing query (e.g. missing index) dies silently:
      // no snapshot ever arrives and the consumer just sees an empty result.
      console.error("[onQuerySnapshot] listener error", query.collection, error);
    },
  );
  const unsubscribeOverlay = overlay.subscribe((change) => {
    // Once we have a base result (server snapshot, cache seed, or an explicitly
    // allowed initial emit), overlay changes may flow through.
    if (!hasReceivedSnapshot && !hasEmitted && !(allowInitialEmit?.() ?? false)) return;
    if (suppressOverlayEmit || !change.collections.has(query.collection)) return;
    emit();
  });

  if (allowInitialEmit?.() ?? false) {
    emit();
  }

  // Seed the first emit from the local cache so a stalled watch stream does not
  // block a fresh query listener (which otherwise waits for the server
  // snapshot; during a connection stall the resource — and the transition that
  // reads it — hangs, freezing the UI). Only seed a NON-EMPTY cache result: an
  // empty result may mean "not cached yet" rather than "truly empty", and an
  // empty base would briefly show an incomplete query. A non-empty cache may
  // still be partial or stale (docs written on other clients missing, a
  // server-deleted doc lingering, or orderBy/limit computed over a subset); the
  // live snapshot reconciles it. Cache data is not server-confirmed, so we
  // neither acknowledge nor set hasReceivedSnapshot. The rejection handler
  // covers only the cache read — an error thrown by emit must not be swallowed;
  // getDocsFromCache resolves empty (rather than rejecting) when nothing is
  // cached, so that path is handled by the snapshot.empty guard above.
  void getDocsFromCache(query.query).then(
    (snapshot) => {
      if (disposed || hasReceivedSnapshot || snapshot.empty) return;
      docWithIds = toDocumentWithIds(snapshot);
      emit({ traced: false });
    },
    () => {
      // Cache read unavailable — fall back to the live snapshot.
    },
  );

  return () => {
    disposed = true;
    unsubscribeOverlay();
    unsubscribeSnapshot();
  };
}
