import { type Firestore } from "firebase/firestore";

import {
  createOptimisticOverlay,
  type OptimisticOverlay,
  type OptimisticOverlayOptions,
  type OverlayMutation,
} from "@/firestore/optimisticOverlay";

export type FirestoreClient = {
  firestore: Firestore;
  overlay: OptimisticOverlay;
  optimisticBatch?: {
    ignoredFieldsForOverlay?: ReadonlySet<string>;
  };
  snapshot?: {
    ignoredFieldsForEquality?: ReadonlySet<string>;
  };
};

export type FirestoreClientOptions = {
  optimisticOverlay?: OptimisticOverlayOptions;
  optimisticBatch?: {
    ignoredFieldsForOverlay?: Iterable<string>;
  };
  snapshot?: {
    ignoredFieldsForEquality?: Iterable<string>;
  };
};

export function createFirestoreClient(
  firestore: Firestore,
  options?: FirestoreClientOptions,
): FirestoreClient {
  return {
    firestore,
    overlay: createOptimisticOverlay(options?.optimisticOverlay),
    optimisticBatch: {
      ignoredFieldsForOverlay: new Set(options?.optimisticBatch?.ignoredFieldsForOverlay),
    },
    snapshot: {
      ignoredFieldsForEquality: new Set(options?.snapshot?.ignoredFieldsForEquality),
    },
  };
}

export function hasDocumentSetOverlay(client: FirestoreClient, path: string): boolean {
  return client.overlay.hasDocumentSetOverlay(path);
}

export function mergeDocumentWithOverlay<T extends object>(
  client: FirestoreClient,
  collection: string,
  id: string,
  snapshotData: (T & { id: string }) | undefined,
): (T & { id: string }) | undefined {
  return client.overlay.mergeDocument<T>(collection, id, snapshotData);
}

export function applyCommittedOverlayMutations(
  client: FirestoreClient,
  batchId: string,
  mutations: OverlayMutation[],
): void {
  if (mutations.length === 0) return;
  client.overlay.apply(batchId, mutations);
  client.overlay.markCommitted(batchId);
}
