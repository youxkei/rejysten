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
  writeBatch,
} from "firebase/firestore";
import { uuidv7 } from "uuidv7";

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
import { type OverlayMutation } from "@/services/firebase/firestore/overlay";
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
    optimisticHistoryHeadStates.set(this.service, { exists: true, entryId: historyEntryId });
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
}

export interface BatchOptions {
  skipHistory?: boolean;
  description?: string;
  prevSelection?: HistorySelection;
  nextSelection?: HistorySelection;
}

const commitQueues = new WeakMap<FirestoreService, Promise<void>>();
const historyQueues = new WeakMap<FirestoreService, Promise<void>>();
const commitFailureStates = new WeakMap<FirestoreService, boolean>();
export type OptimisticHistoryHeadState = { exists: boolean; entryId: string };
const optimisticHistoryHeadStates = new WeakMap<FirestoreService, OptimisticHistoryHeadState>();
const pendingCommitTasksForTest = new Set<{
  service: FirestoreService;
  task: Promise<unknown>;
}>();

export async function getOptimisticHistoryHeadState(service: FirestoreService): Promise<OptimisticHistoryHeadState> {
  const optimistic = optimisticHistoryHeadStates.get(service);
  if (optimistic) return optimistic;

  const signaled = service.editHistoryHead$();
  if (signaled) {
    return { exists: true, entryId: signaled.entryId };
  }

  const editHistoryHeadCol = getCollection(service, "editHistoryHead");
  const cached = await getSingletonDoc(service, editHistoryHeadCol);
  return cached ? { exists: true, entryId: cached.entryId } : { exists: false, entryId: "" };
}

function captureOptimisticHistoryHeadState(service: FirestoreService, batch: Batch): void {
  for (const mutation of batch.overlayMutations) {
    if (
      mutation.collection === "editHistoryHead" &&
      mutation.id === singletonDocumentId &&
      mutation.type !== "delete" &&
      typeof mutation.data.entryId === "string"
    ) {
      optimisticHistoryHeadStates.set(service, { exists: true, entryId: mutation.data.entryId });
    }
  }
}

export async function waitForPendingCommits(options?: {
  service?: FirestoreService;
  timeoutMs?: number;
}): Promise<void> {
  const tasks = Array.from(pendingCommitTasksForTest)
    .filter((entry) => options?.service === undefined || entry.service === options.service)
    .map((entry) => entry.task);
  const all = Promise.all(tasks).then(() => undefined);
  if (options?.timeoutMs === undefined) {
    await all;
    return;
  }

  await Promise.race([all, new Promise<void>((resolve) => setTimeout(resolve, options.timeoutMs))]);
}

export const waitForPendingCommitsForTest = waitForPendingCommits;

export function hasCommitFailureForTest(service: FirestoreService): boolean {
  return commitFailureStates.get(service) ?? false;
}

export async function runBatch(
  service: FirestoreService,
  updateFunction: (batch: Batch) => Promise<void>,
  options?: BatchOptions,
): Promise<void> {
  const {
    services: {
      store: { updateState },
    },
    firestore,
  } = service;

  const batchVersionCol = getCollection(service, "batchVersion");

  try {
    console.timeStamp("batch start");

    updateState((state) => {
      state.servicesFirestoreBatch.lock = true;
    });

    const batchId = uuidv7();
    const wb = writeBatch(firestore);
    const batch = new Batch(service, wb, batchId);
    await updateFunction(batch);
    if (options?.skipHistory) {
      captureOptimisticHistoryHeadState(service, batch);
    }

    service.overlay.apply(batchId, [...batch.overlayMutations]);
    let appliedOverlayMutationCount = batch.overlayMutations.length;

    const previousHistory = historyQueues.get(service) ?? Promise.resolve();
    const historyTask = previousHistory
      .catch(() => undefined)
      .then(async () => {
        await batch.recordHistory(options);
        const unappliedOverlayMutations = batch.overlayMutations.slice(appliedOverlayMutationCount);
        try {
          service.overlay.apply(batchId, [...unappliedOverlayMutations]);
        } catch {
          // Overlay subscribers can be in transient UI states while the server
          // commit queue continues. The Firestore write must not be rolled back
          // just because a local optimistic notification failed.
        }
        appliedOverlayMutationCount = batch.overlayMutations.length;
      });
    historyQueues.set(
      service,
      historyTask.then(() => undefined),
    );

    const previousCommit = commitQueues.get(service) ?? Promise.resolve();
    const commitTask = previousCommit
      .catch(() => undefined)
      .then(async () => {
        await historyTask;

        const newBatchVersion = uuidv7();
        const batchVersionVersion = (await getSingletonDoc(service, batchVersionCol, { fromServer: true }))?.version;
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

        const unappliedOverlayMutations = batch.overlayMutations.slice(appliedOverlayMutationCount);
        try {
          service.overlay.apply(batchId, [...unappliedOverlayMutations]);
        } catch {
          // Overlay subscribers can be in transient UI states while the server
          // commit queue continues. The Firestore write must not be rolled back
          // just because a local optimistic notification failed.
        }
        appliedOverlayMutationCount = batch.overlayMutations.length;

        await wb.commit();
      })
      .then(() => {
        commitFailureStates.set(service, false);
        service.overlay.markCommitted(batchId);
        return true;
      })
      .catch((error: unknown) => {
        commitFailureStates.set(service, true);
        optimisticHistoryHeadStates.delete(service);
        service.overlay.rollback(batchId, error);
        return false;
      });
    commitQueues.set(
      service,
      commitTask.then(() => undefined),
    );
    const pendingCommitTaskForTest = { service, task: commitTask };
    pendingCommitTasksForTest.add(pendingCommitTaskForTest);
    void commitTask.finally(() => {
      pendingCommitTasksForTest.delete(pendingCommitTaskForTest);
    });
    await historyTask.catch(() => undefined);
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
  await waitForPendingCommits({ service });

  const batchVersionCol = getCollection(service, "batchVersion");
  const batchVersionRef = doc(batchVersionCol, singletonDocumentId);
  const batchVersionSnap = await getDocFromServer(batchVersionRef);
  const batchVersionDoc = batchVersionSnap.exists()
    ? withId(singletonDocumentId, batchVersionSnap.data())
    : undefined;

  await firebaseRunTransaction(service.firestore, async (transaction) => {
    // Verify batchVersion hasn't changed since we read it (read before writes)
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
