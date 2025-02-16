import { FirebaseError } from "firebase/app";
import {
  type CollectionReference,
  type DocumentSnapshot,
  type Query,
  type WriteBatch,
  collection,
  doc,
  getDocFromCache,
  getDocsFromCache,
  writeBatch,
  getDocsFromServer,
  getDocFromServer,
  type Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  onSnapshotsInSync,
} from "firebase/firestore";
import {
  type Accessor,
  createComputed,
  createContext,
  createSignal,
  type JSXElement,
  onCleanup,
  type Setter,
  useContext,
} from "solid-js";

import { ServiceNotAvailable } from "@/services/error";
import { type FirebaseService, useFirebaseService } from "@/services/firebase";
import { TransactionAborted } from "@/services/firebase/firestore/error";
import { type Schema } from "@/services/firebase/firestore/schema";
import { initialState, type StoreService, useStoreService } from "@/services/store";

declare module "@/services/store" {
  interface State {
    servicesFirestore: {
      lock: boolean;
    };
  }
}

initialState.servicesFirestore = {
  lock: false,
};

export type FirestoreService = {
  services: {
    firebase: FirebaseService;
    store: StoreService;
  };

  firestore: Firestore;
  clock$: Accessor<boolean>;
  setClock: Setter<boolean>;
  resolve: (() => void) | undefined;
};

const context = createContext<FirestoreService>();

export function FirestoreServiceProvider(props: { children: JSXElement }) {
  const firebase = useFirebaseService();
  const store = useStoreService();

  const firestore = initializeFirestore(firebase.firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  const [clock$, setClock] = createSignal(false);
  createComputed(() => {
    if (clock$()) {
      console.timeStamp("clock high");
    } else {
      console.timeStamp("clock low");
    }
  });

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

export async function runBatch(
  service: FirestoreService,
  updateFunction: (batch: WriteBatch) => Promise<void>,
): Promise<void> {
  const {
    services: {
      store: { state, updateState },
    },
    firestore,
  } = service;

  if (state.servicesFirestore.lock) {
    return;
  }

  try {
    console.timeStamp("batch start");

    updateState((state) => {
      state.servicesFirestore.lock = true;
    });

    const batch = writeBatch(firestore);
    await updateFunction(batch);

    await Promise.race([
      new Promise<void>((resolve) => {
        service.resolve = resolve;
      }),
      batch.commit(),
    ]);
  } catch (e) {
    if (e instanceof TransactionAborted) {
      return;
    } else {
      throw e;
    }
  } finally {
    updateState((state) => {
      state.servicesFirestore.lock = false;
    });

    console.timeStamp("batch end");
  }
}
