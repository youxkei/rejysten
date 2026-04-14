import { FirebaseError } from "firebase/app";
import {
  type DocumentSnapshot,
  type Query,
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
  onSnapshotsInSync,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { type Accessor, createContext, createSignal, type JSXElement, onCleanup, useContext } from "solid-js";

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
  clock$: Accessor<boolean>;
  setClock: (clock: boolean) => void;
  resolve: (() => void) | undefined;
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

  const service: FirestoreService = {
    services: { firebase, store },
    firestore,
    clock$,
    setClock,
    resolve: undefined,
    batchVersion$: () => undefined,
    editHistoryHead$: () => undefined,
  };

  const batchVersionCol = collection(firestore, "batchVersion") as SchemaCollectionReference<"batchVersion">;
  service.batchVersion$ = createSubscribeSignal(service, () => doc(batchVersionCol, singletonDocumentId));

  const editHistoryHeadCol = collection(firestore, "editHistoryHead") as SchemaCollectionReference<"editHistoryHead">;
  service.editHistoryHead$ = createSubscribeSignal(service, () => doc(editHistoryHeadCol, singletonDocumentId));

  const unsubscribe = onSnapshotsInSync(firestore, () => {
    service.resolve?.();
    service.resolve = undefined;
  });
  onCleanup(unsubscribe);

  return <context.Provider value={service}>{props.children}</context.Provider>;
}

export function useFirestoreService() {
  const service = useContext(context);
  if (!service) throw new ServiceNotAvailable("Firestore");

  return service;
}

export function waitForServerSync(service: FirestoreService): Promise<void> {
  const batchVersionCol = collection(service.firestore, "batchVersion") as SchemaCollectionReference<"batchVersion">;
  return new Promise<void>((resolve) => {
    const unsubscribe = onSnapshot(
      doc(batchVersionCol, singletonDocumentId),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!snapshot.metadata.fromCache) {
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
  _service: FirestoreService,
  col: SchemaCollectionReference<C>,
  id: string,
  options?: { fromServer?: boolean },
): Promise<DocumentData<Schema[C]> | undefined> {
  if (options?.fromServer) {
    return getDocumentData(await getDocFromServer(doc(col, id)));
  }

  try {
    return getDocumentData(await getDocFromCache(doc(col, id)));
  } catch (e) {
    if (e instanceof FirebaseError && e.code == "unavailable") {
      return getDocumentData(await getDocFromServer(doc(col, id)));
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
  _service: FirestoreService,
  query: Query<T>,
  options?: { fromServer?: boolean },
): Promise<DocumentData<T>[]> {
  if (options?.fromServer) {
    return (await getDocsFromServer(query)).docs.map(getDocumentData) as DocumentData<T>[];
  }

  try {
    // snapshot.docs must not have non-existing values
    return (await getDocsFromCache(query)).docs.map(getDocumentData) as DocumentData<T>[];
  } catch (e) {
    if (e instanceof FirebaseError && e.code == "unavailable") {
      // snapshot.docs must not have non-existing values
      return (await getDocsFromServer(query)).docs.map(getDocumentData) as DocumentData<T>[];
    }

    throw e;
  }
}
