import { FirebaseError } from "firebase/app";
import {
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
  collection,
  doc,
  getDocFromCache,
  getDocsFromCache,
  getDocsFromServer,
  getDocFromServer,
  type Firestore,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  onSnapshot,
  connectFirestoreEmulator,
  terminate,
} from "firebase/firestore";
import { type Accessor, createContext, createSignal, type JSXElement, onCleanup, useContext } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { ServiceNotAvailable } from "@/services/error";
import { type FirebaseService, useFirebaseService } from "@/services/firebase";
import "@/services/firebase/firestore/editHistory/schema";
import { createOptimisticOverlay, type OptimisticOverlay } from "@/services/firebase/firestore/overlay";
import { type QueryWithMetadata } from "@/services/firebase/firestore/query";
import {
  type DocumentData,
  type Schema,
  type SchemaCollectionReference,
  extractData,
} from "@/services/firebase/firestore/schema";
import { createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { type StoreService, useStoreService } from "@/services/store";

export type FirestoreService = {
  services: {
    firebase: FirebaseService;
    store: StoreService;
  };

  firestore: Firestore;
  overlay: OptimisticOverlay;
  clock$: Accessor<boolean>;
  setClock: (clock: boolean) => void;
  batchVersion$: Accessor<DocumentData<Schema["batchVersion"]> | undefined>;
  editHistoryHead$: Accessor<DocumentData<Schema["editHistoryHead"]> | undefined>;
};

const context = createContext<FirestoreService>();

export function FirestoreServiceProvider(props: {
  children: JSXElement;
  databaseId?: string;
  emulatorPort?: number;
  useMemoryCache?: boolean;
}) {
  const firebase = useFirebaseService();
  const store = useStoreService();

  let firestore: Firestore;
  try {
    firestore = initializeFirestore(
      firebase.firebaseApp,
      {
        localCache: props.useMemoryCache
          ? memoryLocalCache()
          : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      },
      props.databaseId,
    );
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "failed-precondition") {
      // Already initialized with different settings, use getFirestore instead
      firestore = props.databaseId
        ? getFirestore(firebase.firebaseApp, props.databaseId)
        : getFirestore(firebase.firebaseApp);
    } else {
      throw error;
    }
  }

  if (props.emulatorPort) {
    connectFirestoreEmulator(firestore, "localhost", props.emulatorPort);
  } else if (firebase.firebaseApp.options.projectId == "demo") {
    connectFirestoreEmulator(firestore, "localhost", 8080);
  }

  const [clock$, setClockOriginal] = createSignal(false);
  const setClock = (clock: boolean) => {
    if (clock) {
      console.timeStamp("clock high");
    } else {
      console.timeStamp("clock low");
    }

    setClockOriginal(clock);
  };

  const overlay = createOptimisticOverlay();

  const service: FirestoreService = {
    services: { firebase, store },
    firestore,
    overlay,
    clock$,
    setClock,
    batchVersion$: () => undefined,
    editHistoryHead$: () => undefined,
  };

  const batchVersionCol = collection(firestore, "batchVersion") as SchemaCollectionReference<"batchVersion">;
  service.batchVersion$ = createSubscribeSignal(service, () => doc(batchVersionCol, singletonDocumentId));

  const editHistoryHeadCol = collection(firestore, "editHistoryHead") as SchemaCollectionReference<"editHistoryHead">;
  service.editHistoryHead$ = createSubscribeSignal(service, () => doc(editHistoryHeadCol, singletonDocumentId));

  // Terminate the Firestore client on unmount so in-flight operations
  // (batch.commit, listener snapshots) reject with "client terminated"
  // instead of running against a detached component. Prevents hung
  // callbacks from bleeding into the next test case.
  const awaitableTerminate = awaitable(() => terminate(firestore));
  onCleanup(() => {
    setTimeout(() => {
      awaitableTerminate();
    }, 0);
  });

  return <context.Provider value={service}>{props.children}</context.Provider>;
}

export function useFirestoreService() {
  const service = useContext(context);
  if (!service) throw new ServiceNotAvailable("Firestore");

  return service;
}

export function waitForServerSync(service: FirestoreService, expectedVersion?: string): Promise<void> {
  const batchVersionCol = collection(service.firestore, "batchVersion") as SchemaCollectionReference<"batchVersion">;
  return new Promise<void>((resolve) => {
    const unsubscribe = onSnapshot(
      doc(batchVersionCol, singletonDocumentId),
      { includeMetadataChanges: true },
      (snapshot) => {
        const serverVersion = snapshot.data()?.version;
        if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites && (!expectedVersion || serverVersion === expectedVersion)) {
          unsubscribe();
          resolve();
        }
      },
    );
  });
}

export { type SchemaCollectionReference, widenSchemaCollectionRef, withId } from "@/services/firebase/firestore/schema";

export function getCollection<C extends keyof Schema>(
  service: FirestoreService,
  name: C,
): SchemaCollectionReference<C> {
  return collection(service.firestore, name) as SchemaCollectionReference<C>;
}

export { type Timestamps, type DocumentData, extractData } from "@/services/firebase/firestore/schema";

export function getDocumentData<T extends object>(documentSnapshot: DocumentSnapshot<T>): DocumentData<T> | undefined {
  const data = documentSnapshot.data();

  if (data === undefined) {
    return undefined;
  }

  return {
    ...data,
    id: documentSnapshot.id,
  };
}

export async function getDoc<C extends keyof Schema>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  id: string,
  options?: { fromServer?: boolean; applyOverlay?: boolean; excludeOverlayBatchId?: string },
): Promise<DocumentData<Schema[C]> | undefined> {
  if (id === "") return undefined;

  const ref = doc(col, id);
  const mergeSnapshot = (snapshot: DocumentSnapshot<Schema[C]>) => {
    const snapshotData = getDocumentData(snapshot);
    const overlay = (service as { overlay?: OptimisticOverlay }).overlay;
    if (!overlay || options?.applyOverlay === false) {
      return snapshotData;
    }
    if (options?.fromServer) {
      overlay.acknowledgeDocument(ref.path, snapshotData);
      return snapshotData;
    }
    return overlay.mergeDocument<Schema[C]>(col.id, id, snapshotData, {
      excludeBatchId: options?.excludeOverlayBatchId,
    });
  };

  if (options?.fromServer) {
    return mergeSnapshot(await getDocFromServer(ref));
  }

  try {
    return mergeSnapshot(await getDocFromCache(ref));
  } catch (e) {
    if (e instanceof FirebaseError && e.code == "unavailable") {
      return mergeSnapshot(await getDocFromServer(ref));
    }

    throw e;
  }
}

export const singletonDocumentId = "singleton";

export async function getSingletonDoc<C extends keyof Schema>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  options?: { fromServer?: boolean },
): Promise<Schema[C] | undefined> {
  const docData = await getDoc(service, col, singletonDocumentId, options);
  if (!docData) return;

  return extractData(docData).data;
}

export async function getDocs<T extends object>(
  service: FirestoreService,
  query: Query<T> | QueryWithMetadata<T>,
  options?: { fromServer?: boolean },
): Promise<DocumentData<T>[]> {
  const queryMetadata = isQueryWithMetadata(query) ? query : undefined;
  const firestoreQuery: Query<T> = queryMetadata ? queryMetadata.query : (query as Query<T>);
  const mergeSnapshot = (snapshot: QuerySnapshot<T>) => {
    const snapshotData = snapshot.docs.map(getDocumentData) as DocumentData<T>[];
    const limitedSnapshotData =
      queryMetadata?.limit === undefined ? snapshotData : snapshotData.slice(0, queryMetadata.limit);
    const overlay = (service as { overlay?: OptimisticOverlay }).overlay;
    if (!overlay) {
      return limitedSnapshotData;
    }
    if (options?.fromServer) {
      for (const docSnap of snapshot.docs) {
        overlay.acknowledgeDocument(docSnap.ref.path, getDocumentData(docSnap));
      }
      if (queryMetadata) {
        overlay.mergeQuery<T>(snapshotData, {
          collection: queryMetadata.collection,
          filters: queryMetadata.filters,
          orderBys: queryMetadata.orderBys,
          limit: queryMetadata.limit,
          hasUntrackedConstraints: queryMetadata.hasUntrackedConstraints,
        });
      }
      return limitedSnapshotData;
    }
    if (!queryMetadata) return snapshotData;
    return overlay.mergeQuery<T>(snapshotData, {
      collection: queryMetadata.collection,
      filters: queryMetadata.filters,
      orderBys: queryMetadata.orderBys,
      limit: queryMetadata.limit,
      hasUntrackedConstraints: queryMetadata.hasUntrackedConstraints,
    });
  };

  if (options?.fromServer) {
    return mergeSnapshot(await getDocsFromServer(firestoreQuery));
  }

  try {
    // snapshot.docs must not have non-existing values
    return mergeSnapshot(await getDocsFromCache(firestoreQuery));
  } catch (e) {
    if (e instanceof FirebaseError && e.code == "unavailable") {
      // snapshot.docs must not have non-existing values
      return mergeSnapshot(await getDocsFromServer(firestoreQuery));
    }

    throw e;
  }
}

function isQueryWithMetadata<T extends object>(query: Query<T> | QueryWithMetadata<T>): query is QueryWithMetadata<T> {
  return "filters" in query && "orderBys" in query && "query" in query;
}
