import {
  type DocumentReference,
  type PartialWithFieldValue,
  type SetOptions,
  type UpdateData,
  type WithFieldValue,
  writeBatch,
} from "firebase/firestore";

import { type FirestoreClient } from "@/firestore/client";
import { type OverlayMutation } from "@/firestore/optimisticOverlay";

export type OptimisticWriteBatch = {
  readonly batchId: string;
  set<T extends object>(documentRef: DocumentReference<T>, value: WithFieldValue<T>): OptimisticWriteBatch;
  set<T extends object>(
    documentRef: DocumentReference<T>,
    value: PartialWithFieldValue<T>,
    options: SetOptions,
  ): OptimisticWriteBatch;
  update<T extends object>(documentRef: DocumentReference<T>, data: UpdateData<T>): OptimisticWriteBatch;
  delete<T extends object>(documentRef: DocumentReference<T>): OptimisticWriteBatch;
  commit(): void;
};

const emptyIgnoredFieldsForOverlay = new Set<string>();
const optimisticCommitQueues = new WeakMap<object, Promise<void>>();
const serverCommitQueues = new WeakMap<object, Promise<void>>();
const commitFailureStates = new WeakMap<object, boolean>();
const pendingCommitTasks = new Set<{
  client: object;
  task: Promise<unknown>;
}>();

export async function waitForPendingOptimisticCommits(options?: {
  client?: FirestoreClient;
  timeoutMs?: number;
}): Promise<void> {
  const startedAt = Date.now();

  for (;;) {
    const tasks = Array.from(pendingCommitTasks)
      .filter((entry) => options?.client === undefined || entry.client === options.client)
      .map((entry) => entry.task);
    if (tasks.length === 0) return;

    const all = Promise.all(tasks).then(() => undefined);
    if (options?.timeoutMs === undefined) {
      await all;
      continue;
    }

    const remainingMs = options.timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) return;
    await Promise.race([all, new Promise<void>((resolve) => setTimeout(resolve, remainingMs))]);
  }
}

export function hasPendingOptimisticCommits(options?: { client?: FirestoreClient }): boolean {
  return Array.from(pendingCommitTasks).some(
    (entry) => options?.client === undefined || entry.client === options.client,
  );
}

export function hasOptimisticCommitFailure(client: FirestoreClient): boolean {
  return commitFailureStates.get(client) ?? false;
}

export function enqueueOptimisticCommit(client: FirestoreClient, task: () => Promise<void> | void): Promise<void> {
  const previousCommit = optimisticCommitQueues.get(client) ?? Promise.resolve();
  const commitTask = previousCommit.catch(() => undefined).then(task);
  optimisticCommitQueues.set(
    client,
    commitTask.catch(() => undefined),
  );

  const pendingCommitTask = { client, task: commitTask };
  pendingCommitTasks.add(pendingCommitTask);
  void commitTask
    .finally(() => {
      pendingCommitTasks.delete(pendingCommitTask);
    })
    .catch(() => undefined);

  return commitTask;
}

function mutationFromReference<T extends object>(
  type: "set" | "update" | "delete",
  batchId: string,
  documentRef: DocumentReference<T>,
  data?: Record<string, unknown>,
): OverlayMutation {
  const collection = documentRef.parent.id;
  const base = {
    type,
    batchId,
    collection,
    id: documentRef.id,
    path: documentRef.path,
  };
  if (type === "delete") return base as OverlayMutation;
  return { ...base, data: data ?? {} } as OverlayMutation;
}

function overlayDataFromWriteData(
  data: unknown,
  ignoredFieldsForOverlay: ReadonlySet<string>,
): Record<string, unknown> {
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    const source = data as Record<string, unknown>;
    if (ignoredFieldsForOverlay.size === 0) return source;

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (!ignoredFieldsForOverlay.has(key)) {
        result[key] = value;
      }
    }
    return result;
  }
  return {};
}

function isMergeSet(options: SetOptions | undefined): boolean {
  if (options === undefined) return false;
  return "merge" in options || "mergeFields" in options;
}

function createOptimisticBatchId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function optimisticBatch(client: FirestoreClient): OptimisticWriteBatch {
  const { overlay } = client;
  const batch = writeBatch(client.firestore);
  const batchId = createOptimisticBatchId();

  const overlayMutations: OverlayMutation[] = [];
  const ignoredFieldsForOverlay = client.optimisticBatch?.ignoredFieldsForOverlay ?? emptyIgnoredFieldsForOverlay;
  let commitStarted = false;

  function assertCanWrite(): void {
    if (commitStarted) {
      throw new Error("Cannot modify a committed optimistic batch.");
    }
  }

  const batchWrapper: OptimisticWriteBatch = {
    batchId,
    set<T extends object>(
      documentRef: DocumentReference<T>,
      value: WithFieldValue<T> | PartialWithFieldValue<T>,
      options?: SetOptions,
    ): OptimisticWriteBatch {
      assertCanWrite();
      if (options === undefined) {
        batch.set(documentRef, value as WithFieldValue<T>);
      } else {
        batch.set(documentRef, value as PartialWithFieldValue<T>, options);
      }
      const mutationType = isMergeSet(options) ? "update" : "set";
      overlayMutations.push(
        mutationFromReference<T>(
          mutationType,
          batchId,
          documentRef,
          overlayDataFromWriteData(value, ignoredFieldsForOverlay),
        ),
      );
      return batchWrapper;
    },
    update<T extends object>(documentRef: DocumentReference<T>, data: UpdateData<T>): OptimisticWriteBatch {
      assertCanWrite();
      batch.update(documentRef, data);
      overlayMutations.push(
        mutationFromReference<T>(
          "update",
          batchId,
          documentRef,
          overlayDataFromWriteData(data, ignoredFieldsForOverlay),
        ),
      );
      return batchWrapper;
    },
    delete<T extends object>(documentRef: DocumentReference<T>): OptimisticWriteBatch {
      assertCanWrite();
      batch.delete(documentRef);
      overlayMutations.push(mutationFromReference<T>("delete", batchId, documentRef));
      return batchWrapper;
    },
    commit(): void {
      if (commitStarted) {
        throw new Error("Cannot commit an optimistic batch more than once.");
      }
      overlay.apply(batchId, overlayMutations);
      commitStarted = true;

      const previousCommit = serverCommitQueues.get(client) ?? Promise.resolve();
      const commitTask = previousCommit
        .catch(() => undefined)
        .then(async () => {
          await batch.commit();
        })
        .then(() => {
          commitFailureStates.set(client, false);
          overlay.markCommitted(batchId);
          return true;
        })
        .catch((error: unknown) => {
          commitFailureStates.set(client, true);
          overlay.rollback(batchId, error);
          return false;
        });
      serverCommitQueues.set(
        client,
        commitTask.then(() => undefined),
      );

      const pendingCommitTask = { client, task: commitTask };
      pendingCommitTasks.add(pendingCommitTask);
      void commitTask
        .finally(() => {
          pendingCommitTasks.delete(pendingCommitTask);
        })
        .catch(() => undefined);
    },
  };

  return batchWrapper;
}
