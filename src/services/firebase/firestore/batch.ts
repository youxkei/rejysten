import {
  type CollectionReference,
  doc,
  serverTimestamp,
  type Timestamp,
  type WriteBatch,
  writeBatch,
} from "firebase/firestore";
import { uuidv7 } from "uuidv7";

import {
  type DocumentData,
  getCollection,
  getSingletonDoc,
  singletonDocumentId,
  type FirestoreService,
} from "@/services/firebase/firestore";
import { TransactionAborted } from "@/services/firebase/firestore/error";
import { initialState } from "@/services/store";

interface Timestamps {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

declare module "@/services/store" {
  interface State {
    servicesFirestoreBatch: {
      lock: boolean;
    };
  }
}

initialState.servicesFirestoreBatch = {
  lock: false,
};

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    batchVersion: {
      prevVersion: string;
      version: string;

      createdAt: Timestamp;
      updatedAt: Timestamp;
    };
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

  const batchVersionCol = getCollection(service, "batchVersion");

  if (state.servicesFirestoreBatch.lock) {
    return;
  }

  try {
    console.timeStamp("batch start");

    updateState((state) => {
      state.servicesFirestoreBatch.lock = true;
    });

    const batch = writeBatch(firestore);

    const newBatchVersion = uuidv7();
    const batchVersionDoc = await getSingletonDoc(service, batchVersionCol);
    if (batchVersionDoc) {
      updateSingletonDoc(batch, batchVersionCol, {
        prevVersion: batchVersionDoc.version,
        version: newBatchVersion,
      });
    } else {
      setSingletonDoc(batch, batchVersionCol, {
        prevVersion: "",
        version: newBatchVersion,
      });
    }

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
      state.servicesFirestoreBatch.lock = false;
    });

    console.timeStamp("batch end");
  }
}

export function updateDoc<T extends Timestamps>(
  batch: WriteBatch,
  col: CollectionReference<T>,
  newDocData: DocumentData<Partial<Omit<T, keyof Timestamps>>>,
) {
  const { id, ...newDocDataContent } = newDocData;

  batch.update(doc(col, id), {
    ...newDocDataContent,
    updatedAt: serverTimestamp(),
  });
}

export function updateSingletonDoc<T extends Timestamps>(
  batch: WriteBatch,
  col: CollectionReference<T>,
  newDocData: Partial<Omit<T, keyof Timestamps>>,
) {
  updateDoc(batch, col, {
    id: singletonDocumentId,
    ...newDocData,
  });
}

export function setDoc<T extends Timestamps>(
  batch: WriteBatch,
  col: CollectionReference<T>,
  newDocData: DocumentData<Omit<T, keyof Timestamps>>,
) {
  const { id, ...newDocDataContent } = newDocData;

  batch.set(doc(col, id), {
    ...newDocDataContent,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as unknown);
}

export function setSingletonDoc<T extends Timestamps>(
  batch: WriteBatch,
  col: CollectionReference<T>,
  newDocData: Omit<T, keyof Timestamps>,
) {
  setDoc(batch, col, {
    id: singletonDocumentId,
    ...newDocData,
  });
}
