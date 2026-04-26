import type { Schema } from "@/services/firebase/firestore/schema";

import {
  doc,
  getDocFromServer,
  runTransaction as firebaseRunTransaction,
  type Transaction,
  serverTimestamp,
  type Timestamp,
  type UpdateData,
  type WithFieldValue,
} from "firebase/firestore";
import { uuidv7 } from "uuidv7";

import {
  enqueueOptimisticCommit,
  hasOptimisticCommitFailure,
  waitForPendingOptimisticCommits,
  optimisticBatch,
  type OptimisticWriteBatch,
} from "@/firestore/batch";
import { type FirestoreClient } from "@/firestore/client";
import { type OverlayMutation } from "@/firestore/optimisticOverlay";
import {
  type DocumentData,
  extractData,
  withId,
  getDoc,
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

export class OperationRecordingBatch {
  private readonly service: FirestoreService;
  private readonly writer: Writer;
  private readonly batchId: string;
  private readonly _forwardOps: HistoryOperation[] = [];
  private readonly _docReadsNeeded: { collection: keyof Schema; id: string; opType: "update" | "delete" }[] = [];
  private readonly _overlayMutations: OverlayMutation[] = [];

  constructor(service: FirestoreService, writer: Writer, batchId = "") {
    this.service = service;
    this.writer = writer;
    this.batchId = batchId;
  }

  get forwardOps(): readonly HistoryOperation[] {
    return this._forwardOps;
  }

  get overlayMutations(): readonly OverlayMutation[] {
    return this._overlayMutations;
  }

  private pushForwardOp<C extends HistoryOperationCollection>(op: HistoryOperationOf<C>): void {
    this._forwardOps.push(op as HistoryOperation);
  }

  private pushOverlayMutation = (mutation: OverlayMutation) => {
    this._overlayMutations.push(mutation);
  };

  update<C extends keyof Schema>(
    col: SchemaCollectionReference<C>,
    newDocData: DocumentData<Partial<Omit<Schema[C], keyof Timestamps>>>,
  ) {
    const { id, data } = extractData(newDocData);
    if (id === "") return;

    this.writer.update(doc(col, id), {
      ...data,
      updatedAt: serverTimestamp(),
    } as UpdateData<Schema[C]>);

    this.pushOverlayMutation({
      type: "update",
      batchId: "",
      collection: col.id,
      id,
      path: `${String(col.id)}/${id}`,
      data: data as Record<string, unknown>,
    });

    if ("text" in data && typeof data.text === "string") {
      setNgram(this.service, this.writer, col, id, data.text, this.pushOverlayMutation);
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
    if (id === "") return;

    this.writer.delete(doc(col, id));
    this.pushOverlayMutation({
      type: "delete",
      batchId: "",
      collection: col.id,
      id,
      path: `${String(col.id)}/${id}`,
    });
    deleteNgram(this.service, this.writer, col, id, this.pushOverlayMutation);

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
    if (id === "") return;

    this.writer.set(doc(col, id), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as WithFieldValue<Schema[C]>);

    this.pushOverlayMutation({
      type: "set",
      batchId: "",
      collection: col.id,
      id,
      path: `${String(col.id)}/${id}`,
      data: data as Record<string, unknown>,
    });

    if ("text" in data && typeof data.text === "string") {
      setNgram(this.service, this.writer, col, id, data.text, this.pushOverlayMutation);
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
    const currentHead = await getOptimisticHistoryHeadState(this.service);
    const parentId = currentHead.entryId;

    this.set(editHistoryCol, {
      id: historyEntryId,
      parentId,
      description: options?.description ?? "",
      operations: this._forwardOps,
      inverseOperations: inverseOps,
      prevSelection: options?.prevSelection ?? {},
      nextSelection: options?.nextSelection ?? options?.prevSelection ?? {},
    });

    if (currentHead.exists) {
      this.updateSingleton(editHistoryHeadCol, { entryId: historyEntryId });
    } else {
      this.setSingleton(editHistoryHeadCol, { entryId: historyEntryId });
    }
  }

  async buildInverseOps(): Promise<HistoryOperation[]> {
    const oldValues = new Map<string, Record<string, unknown>>();

    for (const read of this._docReadsNeeded) {
      if (read.id === "") continue;
      const key = `${read.collection}/${read.id}`;
      if (oldValues.has(key)) continue;

      try {
        const colRef = getCollection(this.service, read.collection);
        const docData = await getDoc(this.service, colRef, read.id, { excludeOverlayBatchId: this.batchId });
        if (docData) {
          const { id: _id, ...data } = docData as Record<string, unknown> & { id: string };
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

  commit(options?: BatchOptions): Promise<void> {
    const client = getClient(this.service);
    const writer = this.writer;
    if (!isOptimisticWriteBatch(writer)) {
      throw new Error("OperationRecordingBatch.commit requires an optimistic write batch.");
    }

    return enqueueOptimisticCommit(client, async () => {
      await this.recordHistory(options);

      const batchVersionCol = getCollection(this.service, "batchVersion");
      const newBatchVersion = uuidv7();
      const batchVersionVersion = await getOptimisticBatchVersion(this.service, batchVersionCol);
      if (batchVersionVersion) {
        this.updateSingleton(batchVersionCol, {
          prevVersion: batchVersionVersion,
          version: newBatchVersion,
        });
      } else {
        this.setSingleton(batchVersionCol, {
          prevVersion: "",
          version: newBatchVersion,
        });
      }

      writer.commit();
    });
  }
}

export interface BatchOptions {
  skipHistory?: boolean;
  description?: string;
  prevSelection?: HistorySelection;
  nextSelection?: HistorySelection;
}

export type OptimisticHistoryHeadState = { exists: boolean; entryId: string };
const firestoreClientFallbacks = new WeakMap<FirestoreService, FirestoreClient>();
const ignoredFieldsForOverlay = new Set(["createdAt", "updatedAt"]);

function isOptimisticWriteBatch(writer: Writer): writer is Writer & OptimisticWriteBatch {
  return "commit" in writer && typeof writer.commit === "function";
}

export async function getOptimisticHistoryHeadState(service: FirestoreService): Promise<OptimisticHistoryHeadState> {
  const editHistoryHeadCol = getCollection(service, "editHistoryHead");
  const cached = await getSingletonDoc(service, editHistoryHeadCol);
  return cached ? { exists: true, entryId: cached.entryId } : { exists: false, entryId: "" };
}

async function getOptimisticBatchVersion(
  service: FirestoreService,
  batchVersionCol: SchemaCollectionReference<"batchVersion">,
): Promise<string | undefined> {
  const client = getClient(service);
  if (hasOptimisticCommitFailure(client)) {
    return (await getSingletonDoc(service, batchVersionCol, { fromServer: true }))?.version;
  }

  return (await getSingletonDoc(service, batchVersionCol))?.version;
}

function getClient(service: FirestoreService): FirestoreClient {
  const client = (service as { firestoreClient?: FirestoreClient }).firestoreClient;
  if (client) return client;

  const cached = firestoreClientFallbacks.get(service);
  if (cached?.overlay === service.overlay) return cached;

  const fallbackClient: FirestoreClient = {
    firestore: service.firestore,
    overlay: service.overlay,
    optimisticBatch: { ignoredFieldsForOverlay },
  };
  firestoreClientFallbacks.set(service, fallbackClient);
  return fallbackClient;
}

export async function waitForPendingCommits(options?: {
  service?: FirestoreService;
  timeoutMs?: number;
}): Promise<void> {
  const client = options?.service ? getClient(options.service) : undefined;
  await waitForPendingOptimisticCommits({ client, timeoutMs: options?.timeoutMs });
}

export const waitForPendingCommitsForTest = waitForPendingCommits;

export function hasCommitFailureForTest(service: FirestoreService): boolean {
  return hasOptimisticCommitFailure(getClient(service));
}

export async function runBatch(
  service: FirestoreService,
  updateFunction: (batch: OperationRecordingBatch) => Promise<void>,
  options?: BatchOptions,
): Promise<void> {
  const {
    services: {
      store: { updateState },
    },
  } = service;

  try {
    console.timeStamp("batch start");

    updateState((state) => {
      state.servicesFirestoreBatch.lock = true;
    });

    const client = getClient(service);
    const optimisticWriteBatch = optimisticBatch(client);
    const batch = new OperationRecordingBatch(service, optimisticWriteBatch);
    await updateFunction(batch);
    await batch.commit(options);
  } finally {
    updateState((state) => {
      state.servicesFirestoreBatch.lock = false;
    });

    console.timeStamp("batch end");
  }
}

export async function runTransaction(
  service: FirestoreService,
  updateFunction: (batch: OperationRecordingBatch, transaction: Transaction) => Promise<void> | void,
  options?: BatchOptions,
): Promise<void> {
  await waitForPendingCommits({ service });

  const batchVersionCol = getCollection(service, "batchVersion");
  const batchVersionRef = doc(batchVersionCol, singletonDocumentId);
  const batchVersionSnap = await getDocFromServer(batchVersionRef);
  const batchVersionDoc = batchVersionSnap.exists()
    ? withId(singletonDocumentId, batchVersionSnap.data())
    : undefined;
  const overlayBatchId = uuidv7();
  let committedBatch: OperationRecordingBatch | undefined;

  await firebaseRunTransaction(service.firestore, async (transaction) => {
    // Verify batchVersion hasn't changed since we read it (read before writes)
    const currentSnap = await transaction.get(batchVersionRef);
    const currentVersion = currentSnap.data()?.version;
    if (currentVersion !== (batchVersionDoc?.version ?? undefined)) {
      throw new TransactionAborted();
    }

    const batch = new OperationRecordingBatch(service, transaction);
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
    committedBatch = batch;
  });

  if (committedBatch && committedBatch.overlayMutations.length > 0) {
    try {
      service.overlay.apply(overlayBatchId, [...committedBatch.overlayMutations]);
      service.overlay.markCommitted(overlayBatchId);
    } catch {
      // The transaction has already committed; local overlay notification
      // failure must not turn the server write into an application failure.
    }
  }
}
