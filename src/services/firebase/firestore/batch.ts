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
import {
  applyCommittedOverlayMutations,
  createFirestoreClient,
  mergeDocumentWithOverlay,
  type FirestoreClient,
} from "@/firestore/client";
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
import { type Span, endSpan, startSpan, withSpan } from "@/telemetry/span";
import { nextBatchVersionWrite } from "@/writeContract/batchVersion";
import { buildHistoryEntry } from "@/writeContract/historyEntry";
import { deriveInverseOps } from "@/writeContract/inverseOps";

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
      path: `${col.id}/${id}`,
      data: data,
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
      path: `${col.id}/${id}`,
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
      path: `${col.id}/${id}`,
      data: data,
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
    const currentHead = getOptimisticHistoryHeadState(this.service);
    const parentId = currentHead.entryId;

    this.set(editHistoryCol, {
      id: historyEntryId,
      ...buildHistoryEntry<HistoryOperation, HistorySelection>({
        parentId,
        description: options?.description ?? "",
        operations: this._forwardOps,
        inverseOperations: inverseOps,
        prevSelection: options?.prevSelection ?? {},
        nextSelection: options?.nextSelection ?? options?.prevSelection ?? {},
      }),
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

    return deriveInverseOps(this._forwardOps, oldValues) as HistoryOperation[];
  }

  commit(options?: BatchOptions, parentSpan?: Span): Promise<void> {
    const client = getClient(this.service);
    const writer = this.writer;
    if (!isOptimisticWriteBatch(writer)) {
      throw new Error("OperationRecordingBatch.commit requires an optimistic write batch.");
    }

    const queueWaitSpan = startSpan("batch.commitQueueWait", { parent: parentSpan });
    return enqueueOptimisticCommit(client, async () => {
      endSpan(queueWaitSpan);
      await withSpan("batch.recordHistory", () => this.recordHistory(options), { parent: parentSpan });

      const batchVersionCol = getCollection(this.service, "batchVersion");
      const batchVersionVersion = await getOptimisticBatchVersion(this.service);
      const batchVersionWrite = nextBatchVersionWrite(batchVersionVersion, uuidv7());
      if (batchVersionWrite.op === "update") {
        this.updateSingleton(batchVersionCol, batchVersionWrite.data);
      } else {
        this.setSingleton(batchVersionCol, batchVersionWrite.data);
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

export function getOptimisticHistoryHeadState(service: FirestoreService): OptimisticHistoryHeadState {
  const cached = mergeDocumentWithOverlay<Schema["editHistoryHead"]>(
    getClient(service),
    "editHistoryHead",
    singletonDocumentId,
    service.editHistoryHead$(),
  );
  return cached ? { exists: true, entryId: cached.entryId } : { exists: false, entryId: "" };
}

async function getOptimisticBatchVersion(service: FirestoreService): Promise<string | undefined> {
  const client = getClient(service);
  if (hasOptimisticCommitFailure(client)) {
    const batchVersionCol = getCollection(service, "batchVersion");
    return (await getSingletonDoc(service, batchVersionCol, { fromServer: true }))?.version;
  }

  return service.batchVersion$()?.version;
}

function getClient(service: FirestoreService): FirestoreClient {
  const client = (service as { firestoreClient?: FirestoreClient }).firestoreClient;
  if (client) return client;

  const cached = firestoreClientFallbacks.get(service);
  if (cached) return cached;

  const fallbackClient = createFirestoreClient(service.firestore, {
    optimisticBatch: { ignoredFieldsForOverlay },
  });
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

  // Ends when the optimistic commit has run (overlay applied), not when the
  // server commit completes — the latter is recorded by the late-ending
  // batch.serverQueueWait/batch.commit children.
  const runSpan = startSpan("batch.run");
  let failed = false;
  try {
    console.timeStamp("batch start");

    updateState((state) => {
      state.servicesFirestoreBatch.lock = true;
    });

    const client = getClient(service);
    const optimisticWriteBatch = optimisticBatch(client, { parentSpan: runSpan });
    const batch = new OperationRecordingBatch(service, optimisticWriteBatch, optimisticWriteBatch.batchId);
    await withSpan("batch.build", () => updateFunction(batch), { parent: runSpan });
    runSpan.setAttribute("app.mutation_count", batch.overlayMutations.length);
    await batch.commit(options, runSpan);
  } catch (error) {
    failed = true;
    endSpan(runSpan, error);
    throw error;
  } finally {
    updateState((state) => {
      state.servicesFirestoreBatch.lock = false;
    });

    console.timeStamp("batch end");
    if (!failed) runSpan.end();
  }
}

export async function runTransaction(
  service: FirestoreService,
  updateFunction: (batch: OperationRecordingBatch, transaction: Transaction) => Promise<void> | void,
  options?: BatchOptions,
): Promise<void> {
  const transactionSpan = startSpan("batch.transaction");
  let failed = false;
  try {
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
      const batchVersionWrite = nextBatchVersionWrite(batchVersionDoc?.version, uuidv7());
      if (batchVersionWrite.op === "update") {
        batch.updateSingleton(batchVersionCol, batchVersionWrite.data);
      } else {
        batch.setSingleton(batchVersionCol, batchVersionWrite.data);
      }
      committedBatch = batch;
    });

    transactionSpan.setAttribute("app.mutation_count", committedBatch?.overlayMutations.length ?? 0);

    if (committedBatch && committedBatch.overlayMutations.length > 0) {
      try {
        applyCommittedOverlayMutations(getClient(service), overlayBatchId, [...committedBatch.overlayMutations]);
      } catch {
        // The transaction has already committed; local overlay notification
        // failure must not turn the server write into an application failure.
      }
    }
  } catch (error) {
    failed = true;
    endSpan(transactionSpan, error);
    throw error;
  } finally {
    if (!failed) transactionSpan.end();
  }
}
