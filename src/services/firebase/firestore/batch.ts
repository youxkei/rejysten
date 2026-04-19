import type { Schema } from "@/services/firebase/firestore/schema";

import {
  doc,
  getDocFromCache,
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
  extractData,
  withId,
  getCollection,
  getSingletonDoc,
  singletonDocumentId,
  type FirestoreService,
  type Timestamps,
  type SchemaCollectionReference,
} from "@/services/firebase/firestore";
import {
  type HistoryOperation,
  type HistoryOperationCollection,
  type HistoryOperationOf,
  type HistorySelection,
} from "@/services/firebase/firestore/editHistory/schema";
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

const excludedCollections = new Set(["batchVersion", "editHistory", "editHistoryHead", "ngrams"]);

function isHistoryOperationCollection(name: keyof Schema): name is HistoryOperationCollection {
  return !excludedCollections.has(name);
}

export class Batch {
  private readonly service: FirestoreService;
  private readonly writer: Writer;
  private readonly _forwardOps: HistoryOperation[] = [];
  private readonly _docReadsNeeded: { collection: keyof Schema; id: string; opType: "update" | "delete" }[] = [];

  constructor(service: FirestoreService, writer: Writer) {
    this.service = service;
    this.writer = writer;
  }

  get forwardOps(): readonly HistoryOperation[] {
    return this._forwardOps;
  }

  private pushForwardOp<C extends HistoryOperationCollection>(op: HistoryOperationOf<C>): void {
    this._forwardOps.push(op as HistoryOperation);
  }

  update<C extends keyof Schema>(
    col: SchemaCollectionReference<C>,
    newDocData: DocumentData<Partial<Omit<Schema[C], keyof Timestamps>>>,
  ) {
    const { id, data } = extractData(newDocData);

    this.writer.update(doc(col, id), {
      ...data,
      updatedAt: serverTimestamp(),
    } as UpdateData<Schema[C]>);

    if ("text" in data && typeof data.text === "string") {
      setNgram(this.service, this.writer, col, id, data.text);
    }

    if (isHistoryOperationCollection(col.id)) {
      this.pushForwardOp({
        type: "update",
        collection: col.id,
        id,
        data,
      });
      this._docReadsNeeded.push({ collection: col.id, id, opType: "update" });
    }
  }

  updateSingleton<C extends keyof Schema>(
    col: SchemaCollectionReference<C>,
    newDocData: Omit<Partial<Schema[C]>, keyof Timestamps>,
  ) {
    this.update(col, {
      id: singletonDocumentId,
      ...newDocData,
    });
  }

  delete<C extends keyof Schema>(col: SchemaCollectionReference<C>, id: string) {
    this.writer.delete(doc(col, id));
    deleteNgram(this.service, this.writer, col, id);

    if (isHistoryOperationCollection(col.id)) {
      this.pushForwardOp({
        type: "delete",
        collection: col.id,
        id,
      });
      this._docReadsNeeded.push({ collection: col.id, id, opType: "delete" });
    }
  }

  set<C extends keyof Schema>(
    col: SchemaCollectionReference<C>,
    newDocData: DocumentData<Omit<Schema[C], keyof Timestamps>>,
  ) {
    const { id, data } = extractData(newDocData);

    this.writer.set(doc(col, id), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as WithFieldValue<Schema[C]>);

    if ("text" in data && typeof data.text === "string") {
      setNgram(this.service, this.writer, col, id, data.text);
    }

    if (isHistoryOperationCollection(col.id)) {
      this.pushForwardOp({
        type: "set",
        collection: col.id,
        id,
        data,
      });
    }
  }

  setSingleton<C extends keyof Schema>(
    col: SchemaCollectionReference<C>,
    newDocData: Omit<Schema[C], keyof Timestamps>,
  ) {
    this.set(col, withId(singletonDocumentId, newDocData));
  }

  async recordHistory(options?: BatchOptions): Promise<void> {
    if (options?.skipHistory || this._forwardOps.length === 0) return;

    const inverseOps = await this.buildInverseOps();
    const editHistoryCol = getCollection(this.service, "editHistory");
    const editHistoryHeadCol = getCollection(this.service, "editHistoryHead");

    const historyEntryId = uuidv7();
    // Read head from signal first, fall back to Firestore cache if the signal
    // hasn't caught up after a previous action's commit. Without the fallback,
    // rapid successive actions can record history entries with parentId="" and
    // fracture the history tree into disjoint roots.
    let currentHead = this.service.editHistoryHead$();
    if (!currentHead) {
      const cached = await getSingletonDoc(this.service, editHistoryHeadCol);
      if (cached) {
        currentHead = { ...cached, id: singletonDocumentId };
      }
    }
    const parentId = currentHead?.entryId ?? "";

    this.set(editHistoryCol, {
      id: historyEntryId,
      parentId,
      description: options?.description ?? "",
      operations: this._forwardOps,
      inverseOperations: inverseOps,
      prevSelection: options?.prevSelection ?? {},
      nextSelection: options?.nextSelection ?? options?.prevSelection ?? {},
    });

    if (currentHead) {
      this.updateSingleton(editHistoryHeadCol, { entryId: historyEntryId });
    } else {
      this.setSingleton(editHistoryHeadCol, { entryId: historyEntryId });
    }
  }

  async buildInverseOps(): Promise<HistoryOperation[]> {
    const oldValues = new Map<string, Record<string, unknown>>();

    for (const read of this._docReadsNeeded) {
      const key = `${read.collection}/${read.id}`;
      if (oldValues.has(key)) continue;

      try {
        const colRef = getCollection(this.service, read.collection);
        const snap = await getDocFromCache(doc(colRef, read.id));
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          const { createdAt: _, updatedAt: __, ...rest } = data;
          oldValues.set(key, rest);
        }
      } catch {
        // Document not in cache — skip
      }
    }

    const inverseOps: HistoryOperation[] = [];

    for (const fwd of this._forwardOps) {
      const key = `${fwd.collection}/${fwd.id}`;

      switch (fwd.type) {
        case "set":
          inverseOps.push({ type: "delete", collection: fwd.collection, id: fwd.id } as HistoryOperation);
          break;

        case "update": {
          const oldData = oldValues.get(key);
          if (oldData) {
            const inverseData: Record<string, unknown> = {};
            for (const field of Object.keys(fwd.data)) {
              if (field in oldData) {
                inverseData[field] = oldData[field];
              }
            }
            inverseOps.push({
              type: "update",
              collection: fwd.collection,
              id: fwd.id,
              data: inverseData,
            } as HistoryOperation);
          }
          break;
        }

        case "delete": {
          const oldData = oldValues.get(key);
          if (oldData) {
            inverseOps.push({
              type: "set",
              collection: fwd.collection,
              id: fwd.id,
              data: oldData,
            } as HistoryOperation);
          }
          break;
        }
      }
    }

    return inverseOps.reverse();
  }
}

export interface BatchOptions {
  skipHistory?: boolean;
  description?: string;
  prevSelection?: HistorySelection;
  nextSelection?: HistorySelection;
}

export async function runBatch(
  service: FirestoreService,
  updateFunction: (batch: Batch) => Promise<void>,
  options?: BatchOptions,
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
    const batchVersionSignal = service.batchVersion$();
    let batchVersionVersion = batchVersionSignal?.version;
    if (!batchVersionVersion) {
      batchVersionVersion = (await getSingletonDoc(service, batchVersionCol))?.version;
    }
    if (batchVersionVersion) {
      batch.updateSingleton(batchVersionCol, {
        prevVersion: batchVersionVersion,
        version: newBatchVersion,
      });
    } else {
      batch.setSingleton(batchVersionCol, {
        prevVersion: "",
        version: newBatchVersion,
      });
    }

    await updateFunction(batch);

    await batch.recordHistory(options);

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
  options?: BatchOptions,
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

    await batch.recordHistory(options);

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
