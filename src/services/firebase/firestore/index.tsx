import { FirebaseError } from "firebase/app";
import {
  type CollectionReference,
  type DocumentSnapshot,
  type Query,
  collection,
  doc,
  getDocFromCache,
  getDocsFromCache,
  getDocsFromServer,
  getDocFromServer,
  type Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  onSnapshotsInSync,
  connectFirestoreEmulator,
  type Timestamp,
} from "firebase/firestore";
import { type Accessor, createContext, createSignal, type JSXElement, onCleanup, useContext } from "solid-js";

import { ServiceNotAvailable } from "@/services/error";
import { type FirebaseService, useFirebaseService } from "@/services/firebase";
import { type Schema } from "@/services/firebase/firestore/schema";
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
};

const context = createContext<FirestoreService>();

export function FirestoreServiceProvider(props: { children: JSXElement }) {
  const firebase = useFirebaseService();
  const store = useStoreService();

  const firestore = initializeFirestore(firebase.firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  if (firebase.firebaseApp.options.projectId == "demo") {
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

  const service: FirestoreService = { services: { firebase, store }, firestore, clock$, setClock, resolve: undefined };

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

export function getCollection<Name extends keyof Schema>(service: FirestoreService, name: Name) {
  return collection(service.firestore, name) as CollectionReference<Schema[Name]>;
}

export interface Timestamps {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DocumentData<T extends object> = T & { id: string };

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

export async function getDoc<T extends object>(
  _service: FirestoreService,
  col: CollectionReference<T>,
  id: string,
): Promise<DocumentData<T> | undefined> {
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

export async function getSingletonDoc<T extends object>(
  service: FirestoreService,
  col: CollectionReference<T>,
): Promise<T | undefined> {
  const data = await getDoc(service, col, singletonDocumentId);
  if (!data) return;

  const { id: _, ...dataWithoutId } = data;

  return dataWithoutId as T;
}

export async function getDocs<T extends object>(
  _service: FirestoreService,
  query: Query<T>,
): Promise<DocumentData<T>[]> {
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
