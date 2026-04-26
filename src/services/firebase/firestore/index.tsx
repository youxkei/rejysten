import { FirebaseError } from "firebase/app";
import {
  type DocumentSnapshot,
  type Query,
  collection,
  doc,
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
import { createFirestoreClient, type FirestoreClient } from "@/firestore/client";
import {
  getDoc as getFirestoreDoc,
  getDocs as getFirestoreDocs,
} from "@/firestore/get";
import { type OptimisticOverlay } from "@/firestore/optimisticOverlay";
import { type QueryWithMetadata } from "@/firestore/query";
import { ServiceNotAvailable } from "@/services/error";
import { type FirebaseService, useFirebaseService } from "@/services/firebase";
import "@/services/firebase/firestore/editHistory/schema";
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
  firestoreClient?: FirestoreClient;
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

  const firestoreClient = createFirestoreClient(firestore, {
    optimisticBatch: {
      ignoredFieldsForOverlay: ["createdAt", "updatedAt"],
    },
    snapshot: {
      ignoredFieldsForEquality: ["createdAt", "updatedAt"],
    },
  });

  const service: FirestoreService = {
    services: { firebase, store },
    firestore,
    firestoreClient,
    overlay: firestoreClient.overlay,
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

function getClient(service: FirestoreService): FirestoreClient {
  return (service as { firestoreClient?: FirestoreClient }).firestoreClient ?? {
    firestore: service.firestore,
    overlay: service.overlay,
  };
}

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

  return getFirestoreDoc({
    client: getClient(service),
    ref: doc(col, id),
    getSnapshotData: getDocumentData,
    fromServer: options?.fromServer,
    applyOverlay: options?.applyOverlay,
    excludeOverlayBatchId: options?.excludeOverlayBatchId,
  });
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
  return getFirestoreDocs({
    client: getClient(service),
    query,
    getSnapshotData: getDocumentData,
    fromServer: options?.fromServer,
  });
}
