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
import { deleteNgram, setNgram } from "@/services/firebase/firestore/ngram";
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

export class Batch {
  private readonly service: FirestoreService;
  private readonly writeBatch: WriteBatch;

  constructor(service: FirestoreService, writeBatch: WriteBatch) {
    this.service = service;
    this.writeBatch = writeBatch;
  }

  commit(): Promise<void> {
    return this.writeBatch.commit();
  }

  update<T extends Timestamps>(
    col: CollectionReference<T>,
    newDocData: DocumentData<Omit<Partial<T>, keyof Timestamps>>,
  ) {
    const { id, ...newDocDataContent } = newDocData;

    this.writeBatch.update(doc(col, id), {
      ...newDocDataContent,
      updatedAt: serverTimestamp(),
    });

    if ("text" in newDocDataContent && typeof newDocDataContent.text === "string") {
      setNgram(this.service, this.writeBatch, col, id, newDocDataContent.text);
    }
  }

  updateSingleton<T extends Timestamps>(col: CollectionReference<T>, newDocData: Omit<Partial<T>, keyof Timestamps>) {
    this.update(col, {
      id: singletonDocumentId,
      ...newDocData,
    });
  }

  delete<T extends Timestamps>(col: CollectionReference<T>, id: string) {
    this.writeBatch.delete(doc(col, id));
    deleteNgram(this.service, this.writeBatch, col, id);
  }

  set<T extends Timestamps>(col: CollectionReference<T>, newDocData: Omit<DocumentData<T>, keyof Timestamps>) {
    const { id, ...newDocDataContent } = newDocData;

    this.writeBatch.set(doc(col, id), {
      ...newDocDataContent,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as unknown);

    if ("text" in newDocDataContent && typeof newDocDataContent.text === "string") {
      setNgram(this.service, this.writeBatch, col, id, newDocDataContent.text);
    }
  }

  setSingleton<T extends Timestamps>(col: CollectionReference<T>, newDocData: Omit<T, keyof Timestamps>) {
    this.set(col, {
      ...(newDocData as Omit<DocumentData<T>, keyof Timestamps>),
      id: singletonDocumentId,
    });
  }
}

export async function runBatch(
  service: FirestoreService,
  updateFunction: (batch: Batch) => Promise<void>,
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

    const batch = new Batch(service, writeBatch(firestore));

    const newBatchVersion = uuidv7();
    const batchVersionDoc = service.batchVersion$();
    if (batchVersionDoc) {
      batch.updateSingleton(batchVersionCol, {
        prevVersion: batchVersionDoc.version,
        version: newBatchVersion,
      });
    } else {
      batch.setSingleton(batchVersionCol, {
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
