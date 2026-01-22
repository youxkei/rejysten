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
  singletonDocumentId,
  type FirestoreService,
  type Timestamps,
} from "@/services/firebase/firestore";
import { TransactionAborted } from "@/services/firebase/firestore/error";
import { setNgram } from "@/services/firebase/firestore/ngram";
import { initialState } from "@/services/store";

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
    const batchVersionDoc = service.batchVersion$();
    if (batchVersionDoc) {
      updateSingletonDoc(service, batch, batchVersionCol, {
        prevVersion: batchVersionDoc.version,
        version: newBatchVersion,
      });
    } else {
      setSingletonDoc(service, batch, batchVersionCol, {
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
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  newDocData: DocumentData<Omit<Partial<T>, keyof Timestamps>>,
) {
  const { id, ...newDocDataContent } = newDocData;

  batch.update(doc(col, id), {
    ...newDocDataContent,
    updatedAt: serverTimestamp(),
  });

  if ("text" in newDocDataContent && typeof newDocDataContent.text === "string") {
    setNgram(service, batch, col, id, newDocDataContent.text);
  }
}

export function updateSingletonDoc<T extends Timestamps>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  newDocData: Omit<Partial<T>, keyof Timestamps>,
) {
  updateDoc(service, batch, col, {
    id: singletonDocumentId,
    ...newDocData,
  });
}

export function setDoc<T extends Timestamps>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  newDocData: Omit<DocumentData<T>, keyof Timestamps>,
) {
  const { id, ...newDocDataContent } = newDocData;

  batch.set(doc(col, id), {
    ...newDocDataContent,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as unknown);

  if ("text" in newDocDataContent && typeof newDocDataContent.text === "string") {
    setNgram(service, batch, col, id, newDocDataContent.text);
  }
}

export function setSingletonDoc<T extends Timestamps>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  newDocData: Omit<T, keyof Timestamps>,
) {
  setDoc(service, batch, col, {
    ...(newDocData as Omit<DocumentData<T>, keyof Timestamps>),
    id: singletonDocumentId,
  });
}
