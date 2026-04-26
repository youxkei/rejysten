import { type Firestore } from "firebase/firestore";

import {
  createOptimisticOverlay,
  type OptimisticOverlay,
  type OptimisticOverlayOptions,
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
