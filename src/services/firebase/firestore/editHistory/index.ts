import {
  type FirestoreService,
  type SchemaCollectionReference,
  getCollection,
  getDoc,
  getDocs,
  type DocumentData,
} from "@/services/firebase/firestore";
import {
  getOptimisticHistoryHeadState,
  runBatch,
  type OperationRecordingBatch,
  waitForPendingCommits,
} from "@/services/firebase/firestore/batch";
import { type HistoryOperation, type HistorySelection } from "@/services/firebase/firestore/editHistory/schema";
import { query, where } from "@/services/firebase/firestore/query";
import { type Schema } from "@/services/firebase/firestore/schema";

function applyOperations(service: FirestoreService, batch: OperationRecordingBatch, operations: HistoryOperation[]): void {
  for (const op of operations) {
    const col = getCollection(service, op.collection);

    switch (op.type) {
      case "set":
        batch.set(col, { id: op.id, ...op.data } as never);
        break;
      case "update":
        batch.update(col, { id: op.id, ...op.data } as never);
        break;
      case "delete":
        batch.delete(col, op.id);
        break;
    }
  }
}

type HistoryReadOptions = {
  waitForPendingCommits?: boolean;
};

function shouldWaitForPendingCommits(options?: HistoryReadOptions): boolean {
  return options?.waitForPendingCommits !== false;
}

async function getCurrentHeadState(service: FirestoreService, options?: HistoryReadOptions) {
  if (shouldWaitForPendingCommits(options)) {
    await waitForPendingCommits({ service });
  }
  return getOptimisticHistoryHeadState(service);
}

export async function getChildren(
  service: FirestoreService,
  parentEntryId: string,
  options?: HistoryReadOptions,
): Promise<DocumentData<Schema["editHistory"]>[]> {
  if (shouldWaitForPendingCommits(options)) {
    await waitForPendingCommits({ service });
  }
  const editHistoryCol = getCollection(service, "editHistory");
  const children = await getDocs(service, query(editHistoryCol, where("parentId", "==", parentEntryId)));
  return children.sort((a, b) => a.id.localeCompare(b.id));
}

export async function undo(service: FirestoreService, options?: HistoryReadOptions): Promise<HistorySelection | undefined> {
  const headEntryId = (await getCurrentHeadState(service, options)).entryId;
  if (!headEntryId) return undefined;

  const editHistoryCol = getCollection(service, "editHistory");
  const entry = await getDoc(service, editHistoryCol, headEntryId);
  if (!entry) return undefined;

  const editHistoryHeadCol = getCollection(service, "editHistoryHead");

  await runBatch(
    service,
    (batch) => {
      applyOperations(service, batch, entry.inverseOperations);
      batch.updateSingleton(editHistoryHeadCol, { entryId: entry.parentId });
      return Promise.resolve();
    },
    { skipHistory: true },
  );
  if (shouldWaitForPendingCommits(options)) {
    await waitForPendingCommits({ service });
  }

  return entry.prevSelection;
}

export async function redo(
  service: FirestoreService,
  childId?: string,
  options?: HistoryReadOptions,
): Promise<HistorySelection | undefined> {
  const head = await getCurrentHeadState(service, options);
  const headEntryId = head.entryId;
  const headExists = head.exists;
  const currentEntryId = headEntryId;

  const editHistoryCol = getCollection(service, "editHistory");
  const children = await getDocs(service, query(editHistoryCol, where("parentId", "==", currentEntryId)));

  if (children.length === 0) return undefined;

  const targetChild = childId
    ? children.find((c) => c.id === childId)
    : children.sort((a, b) => a.id.localeCompare(b.id)).at(-1);

  if (!targetChild) return undefined;

  const editHistoryHeadCol = getCollection(service, "editHistoryHead");

  await runBatch(
    service,
    (batch) => {
      applyOperations(service, batch, targetChild.operations);
      if (headExists) {
        batch.updateSingleton(editHistoryHeadCol, { entryId: targetChild.id });
      } else {
        batch.setSingleton(editHistoryHeadCol, { entryId: targetChild.id });
      }
      return Promise.resolve();
    },
    { skipHistory: true },
  );
  if (shouldWaitForPendingCommits(options)) {
    await waitForPendingCommits({ service });
  }

  return targetChild.nextSelection;
}

async function buildAncestorChain(
  service: FirestoreService,
  col: SchemaCollectionReference<"editHistory">,
  entryId: string,
): Promise<DocumentData<Schema["editHistory"]>[]> {
  const chain: DocumentData<Schema["editHistory"]>[] = [];
  let currentId = entryId;

  while (currentId !== "") {
    const entry = await getDoc(service, col, currentId);
    if (!entry) break;
    chain.push(entry);
    currentId = entry.parentId;
  }

  return chain;
}

export async function jumpTo(
  service: FirestoreService,
  targetId: string,
  options?: HistoryReadOptions,
): Promise<HistorySelection | undefined> {
  const headState = await getCurrentHeadState(service, options);
  const headEntryId = headState.entryId;
  const currentId = headEntryId;

  if (currentId === targetId) return undefined;

  const editHistoryCol = getCollection(service, "editHistory");

  const currentAncestors = await buildAncestorChain(service, editHistoryCol, currentId);
  const targetAncestors = await buildAncestorChain(service, editHistoryCol, targetId);

  const targetAncestorSet = new Set(targetAncestors.map((e) => e.id));
  let lcaId = "";
  let undoEntries: DocumentData<Schema["editHistory"]>[] = currentAncestors;

  for (let i = 0; i < currentAncestors.length; i++) {
    if (targetAncestorSet.has(currentAncestors[i].id)) {
      lcaId = currentAncestors[i].id;
      undoEntries = currentAncestors.slice(0, i);
      break;
    }
  }

  const targetLcaIndex = targetAncestors.findIndex((e) => e.id === lcaId);
  const redoEntries =
    targetLcaIndex >= 0 ? targetAncestors.slice(0, targetLcaIndex).reverse() : targetAncestors.slice().reverse();

  const editHistoryHeadCol = getCollection(service, "editHistoryHead");

  await runBatch(
    service,
    (batch) => {
      for (const entry of undoEntries) {
        applyOperations(service, batch, entry.inverseOperations);
      }
      for (const entry of redoEntries) {
        applyOperations(service, batch, entry.operations);
      }
      if (headEntryId) {
        batch.updateSingleton(editHistoryHeadCol, { entryId: targetId });
      } else if (headState.exists) {
        batch.updateSingleton(editHistoryHeadCol, { entryId: targetId });
      } else {
        batch.setSingleton(editHistoryHeadCol, { entryId: targetId });
      }
      return Promise.resolve();
    },
    { skipHistory: true },
  );
  if (shouldWaitForPendingCommits(options)) {
    await waitForPendingCommits({ service });
  }

  // Return the selection to restore:
  // - If we ended up at the root ("" — all ancestors undone), return undefined
  // - If target is the result of undo (target is ancestor of current), return target.prevSelection
  //   (the state BEFORE target was applied... wait, no: after undoing target's children,
  //    we're at the state AFTER target was applied, which is target.nextSelection)
  // Simpler: always return target.nextSelection (the state after target was applied).
  if (targetId === "") return undefined;
  if (targetAncestors.length > 0) {
    return targetAncestors[0].nextSelection;
  }
  const targetEntry = await getDoc(service, editHistoryCol, targetId);
  return targetEntry?.nextSelection;
}
