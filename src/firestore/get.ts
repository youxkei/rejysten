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
import { type DocumentWithId, getDocumentWithId } from "@/firestore/document";
import { type QueryWithMetadata } from "@/firestore/query";
import { withSpan } from "@/telemetry/span";

export type GetDocOptions<T extends object> = {
  client: FirestoreClient;
  ref: DocumentReference<T>;
  fromServer?: boolean;
  applyOverlay?: boolean;
  excludeOverlayBatchId?: string;
};

export async function getDoc<T extends object>(options: GetDocOptions<T>): Promise<DocumentWithId<T> | undefined> {
  const { client, ref } = options;

  return withSpan(
    "firestore.getDoc",
    async (span) => {
      const mergeSnapshot = (snapshot: DocumentSnapshot<T>): DocumentWithId<T> | undefined => {
        const docWithId = getDocumentWithId(snapshot);
        if (options.applyOverlay === false) {
          return docWithId;
        }
        if (options.fromServer) {
          client.overlay.acknowledgeDocument(ref.path, docWithId);
          return docWithId;
        }
        return client.overlay.mergeDocument<T>(ref.parent.id, ref.id, docWithId, {
          excludeBatchId: options.excludeOverlayBatchId,
        });
      };

      if (options.fromServer) {
        span.setAttribute("app.source", "server");
        return mergeSnapshot(await getDocFromServer(ref));
      }

      try {
        const result = mergeSnapshot(await getDocFromCache(ref));
        span.setAttribute("app.source", "cache");
        return result;
      } catch (error) {
        if (error instanceof FirebaseError && error.code === "unavailable") {
          span.setAttribute("app.source", "server");
          return mergeSnapshot(await getDocFromServer(ref));
        }

        throw error;
      }
    },
    { attributes: { "app.collection": ref.parent.id, "app.doc_id": ref.id } },
  );
}

export type GetDocsOptions<T extends object> = {
  client: FirestoreClient;
  query: Query<T> | QueryWithMetadata<T>;
  fromServer?: boolean;
  applyOverlay?: boolean;
};

export async function getDocs<T extends object>(options: GetDocsOptions<T>): Promise<DocumentWithId<T>[]> {
  const { client } = options;
  const sourceQuery = options.query;
  let queryMetadata: QueryWithMetadata<T> | undefined;
  let firestoreQuery: Query<T>;
  if (isQueryWithMetadata(sourceQuery)) {
    queryMetadata = sourceQuery;
    firestoreQuery = sourceQuery.query;
  } else {
    firestoreQuery = sourceQuery;
  }

  return withSpan(
    "firestore.getDocs",
    async (span) => {
      const mergeSnapshot = (snapshot: QuerySnapshot<T>): DocumentWithId<T>[] => {
        const docWithIds = snapshot.docs.flatMap((docSnap) => {
          const docWithId = getDocumentWithId(docSnap);
          return docWithId === undefined ? [] : [docWithId];
        });
        const limitedDocWithIds =
          queryMetadata?.limit === undefined ? docWithIds : docWithIds.slice(0, queryMetadata.limit);

        if (options.applyOverlay === false) {
          return limitedDocWithIds;
        }

        if (options.fromServer) {
          for (const docSnap of snapshot.docs) {
            const docWithId = getDocumentWithId(docSnap);
            client.overlay.acknowledgeDocument(docSnap.ref.path, docWithId);
          }
          if (queryMetadata) {
            client.overlay.mergeQuery<T>(docWithIds, {
              collection: queryMetadata.collection,
              filters: queryMetadata.filters,
              orderBys: queryMetadata.orderBys,
              limit: queryMetadata.limit,
              hasUntrackedConstraints: queryMetadata.hasUntrackedConstraints,
            });
          }
          return limitedDocWithIds;
        }

        if (!queryMetadata) {
          return docWithIds;
        }
        return client.overlay.mergeQuery<T>(docWithIds, {
          collection: queryMetadata.collection,
          filters: queryMetadata.filters,
          orderBys: queryMetadata.orderBys,
          limit: queryMetadata.limit,
          hasUntrackedConstraints: queryMetadata.hasUntrackedConstraints,
        });
      };

      const finish = (docs: DocumentWithId<T>[]): DocumentWithId<T>[] => {
        span.setAttribute("app.doc_count", docs.length);
        return docs;
      };

      if (options.fromServer) {
        span.setAttribute("app.source", "server");
        return finish(mergeSnapshot(await getDocsFromServer(firestoreQuery)));
      }

      try {
        const result = finish(mergeSnapshot(await getDocsFromCache(firestoreQuery)));
        span.setAttribute("app.source", "cache");
        return result;
      } catch (error) {
        if (error instanceof FirebaseError && error.code === "unavailable") {
          span.setAttribute("app.source", "server");
          return finish(mergeSnapshot(await getDocsFromServer(firestoreQuery)));
        }

        throw error;
      }
    },
    { attributes: queryMetadata ? { "app.collection": queryMetadata.collection } : undefined },
  );
}

function isQueryWithMetadata<T extends object>(query: Query<T> | QueryWithMetadata<T>): query is QueryWithMetadata<T> {
  return "filters" in query && "orderBys" in query && "query" in query;
}
