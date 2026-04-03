import {
  type CollectionReference,
  doc,
  runTransaction as firebaseRunTransaction,
  type Transaction,
  serverTimestamp,
  type Timestamp,
  type UpdateData,
  type WithFieldValue,
  writeBatch,
} from "firebase/firestore";
import { uuidv7 } from "uuidv7";

import {
  type DocumentData,
  getCollection,
  getSingletonDoc,
  singletonDocumentId,
  type FirestoreService,
  type Timestamps,
} from "@/services/firebase/firestore";
import { TransactionAborted } from "@/services/firebase/firestore/error";
import { deleteNgram, setNgram } from "@/services/firebase/firestore/ngram";
import { type Writer } from "@/services/firebase/firestore/writer";
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
  private readonly writer: Writer;

  constructor(service: FirestoreService, writer: Writer) {
    this.service = service;
    this.writer = writer;
  }

  update<T extends Timestamps>(
    col: CollectionReference<T>,
    newDocData: DocumentData<Omit<Partial<T>, keyof Timestamps>>,
  ) {
    const { id, ...newDocDataContent } = newDocData;

    this.writer.update<T>(doc(col, id), {
      ...newDocDataContent,
      updatedAt: serverTimestamp(),
    } as UpdateData<T>);

    if ("text" in newDocDataContent && typeof newDocDataContent.text === "string") {
      setNgram(this.service, this.writer, col, id, newDocDataContent.text);
    }
  }

  updateSingleton<T extends Timestamps>(col: CollectionReference<T>, newDocData: Omit<Partial<T>, keyof Timestamps>) {
    this.update(col, {
      id: singletonDocumentId,
      ...newDocData,
    });
  }

  delete<T extends Timestamps>(col: CollectionReference<T>, id: string) {
    this.writer.delete<T>(doc(col, id));
    deleteNgram(this.service, this.writer, col, id);
  }

  set<T extends Timestamps>(col: CollectionReference<T>, newDocData: Omit<DocumentData<T>, keyof Timestamps>) {
    const { id, ...newDocDataContent } = newDocData;

    this.writer.set<T>(doc(col, id), {
      ...newDocDataContent,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as WithFieldValue<T>);

    if ("text" in newDocDataContent && typeof newDocDataContent.text === "string") {
      setNgram(this.service, this.writer, col, id, newDocDataContent.text);
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

    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb);

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
      wb.commit(),
    ]);
  } finally {
    updateState((state) => {
      state.servicesFirestoreBatch.lock = false;
    });

    console.timeStamp("batch end");
  }
}

export async function runTransaction(
  service: FirestoreService,
  updateFunction: (batch: Batch, transaction: Transaction) => Promise<void> | void,
): Promise<void> {
  const batchVersionCol = getCollection(service, "batchVersion");
  const batchVersionDoc = await getSingletonDoc(service, batchVersionCol, { fromServer: true });

  await firebaseRunTransaction(service.firestore, async (transaction) => {
    // Verify batchVersion hasn't changed since we read it (read before writes)
    const batchVersionRef = doc(batchVersionCol, singletonDocumentId);
    const currentSnap = await transaction.get(batchVersionRef);
    const currentVersion = currentSnap.data()?.version;
    if (currentVersion !== (batchVersionDoc?.version ?? undefined)) {
      throw new TransactionAborted();
    }

    const batch = new Batch(service, transaction);
    await updateFunction(batch, transaction);

    // Update batchVersion after all reads are done
    const newBatchVersion = uuidv7();
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
  });
}
