import { FirebaseError } from "firebase/app";
import {
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
  getDocFromCache,
  getDocFromServer,
  getDocsFromCache,
  getDocsFromServer,
} from "firebase/firestore";

import { type FirestoreClient } from "@/firestore/client";
import { type QueryWithMetadata } from "@/firestore/query";

export type GetSnapshotData<T extends object, D extends T & { id: string }> = (
  snapshot: DocumentSnapshot<T>,
) => D | undefined;

export type GetDocOptions<T extends object, D extends T & { id: string }> = {
  client: FirestoreClient;
  ref: DocumentReference<T>;
  getSnapshotData: GetSnapshotData<T, D>;
  fromServer?: boolean;
  applyOverlay?: boolean;
  excludeOverlayBatchId?: string;
};

export async function getDoc<T extends object, D extends T & { id: string }>(
  options: GetDocOptions<T, D>,
): Promise<D | undefined> {
  const { client, ref, getSnapshotData } = options;

  const mergeSnapshot = (snapshot: DocumentSnapshot<T>): D | undefined => {
    const snapshotData = getSnapshotData(snapshot);
    if (options.applyOverlay === false) {
      return snapshotData;
    }
    if (options.fromServer) {
      client.overlay.acknowledgeDocument(ref.path, snapshotData);
      return snapshotData;
    }
    return client.overlay.mergeDocument<T>(ref.parent.id, ref.id, snapshotData, {
      excludeBatchId: options.excludeOverlayBatchId,
    }) as D | undefined;
  };

  if (options.fromServer) {
    return mergeSnapshot(await getDocFromServer(ref));
  }

  try {
    return mergeSnapshot(await getDocFromCache(ref));
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "unavailable") {
      return mergeSnapshot(await getDocFromServer(ref));
    }

    throw error;
  }
}

export type GetDocsOptions<T extends object, D extends T & { id: string }> = {
  client: FirestoreClient;
  query: Query<T> | QueryWithMetadata<T>;
  getSnapshotData: GetSnapshotData<T, D>;
  fromServer?: boolean;
  applyOverlay?: boolean;
};

export async function getDocs<T extends object, D extends T & { id: string }>(
  options: GetDocsOptions<T, D>,
): Promise<D[]> {
  const { client, getSnapshotData } = options;
  const sourceQuery = options.query;
  let queryMetadata: QueryWithMetadata<T> | undefined;
  let firestoreQuery: Query<T>;
  if (isQueryWithMetadata(sourceQuery)) {
    queryMetadata = sourceQuery;
    firestoreQuery = sourceQuery.query;
  } else {
    firestoreQuery = sourceQuery;
  }

  const mergeSnapshot = (snapshot: QuerySnapshot<T>): D[] => {
    const snapshotData = snapshot.docs.flatMap((docSnap) => {
      const data = getSnapshotData(docSnap);
      return data === undefined ? [] : [data];
    });
    const limitedSnapshotData =
      queryMetadata?.limit === undefined ? snapshotData : snapshotData.slice(0, queryMetadata.limit);

    if (options.applyOverlay === false) {
      return limitedSnapshotData;
    }

    if (options.fromServer) {
      for (const docSnap of snapshot.docs) {
        client.overlay.acknowledgeDocument(docSnap.ref.path, getSnapshotData(docSnap));
      }
      if (queryMetadata) {
        client.overlay.mergeQuery<T>(snapshotData, {
          collection: queryMetadata.collection,
          filters: queryMetadata.filters,
          orderBys: queryMetadata.orderBys,
          limit: queryMetadata.limit,
          hasUntrackedConstraints: queryMetadata.hasUntrackedConstraints,
        });
      }
      return limitedSnapshotData;
    }

    if (!queryMetadata) {
      return snapshotData;
    }
    return client.overlay.mergeQuery<T>(snapshotData, {
      collection: queryMetadata.collection,
      filters: queryMetadata.filters,
      orderBys: queryMetadata.orderBys,
      limit: queryMetadata.limit,
      hasUntrackedConstraints: queryMetadata.hasUntrackedConstraints,
    }) as D[];
  };

  if (options.fromServer) {
    return mergeSnapshot(await getDocsFromServer(firestoreQuery));
  }

  try {
    return mergeSnapshot(await getDocsFromCache(firestoreQuery));
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "unavailable") {
      return mergeSnapshot(await getDocsFromServer(firestoreQuery));
    }

    throw error;
  }
}

function isQueryWithMetadata<T extends object>(
  query: Query<T> | QueryWithMetadata<T>,
): query is QueryWithMetadata<T> {
  return "filters" in query && "orderBys" in query && "query" in query;
}
