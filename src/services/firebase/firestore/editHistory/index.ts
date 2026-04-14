import { collection, type CollectionReference, query, where } from "firebase/firestore";

import {
  type FirestoreService,
  getCollection,
  getDoc,
  getDocs,
  type DocumentData,
} from "@/services/firebase/firestore";
import { runBatch, type Batch } from "@/services/firebase/firestore/batch";
import { type HistoryOperation, type HistorySelection } from "@/services/firebase/firestore/editHistory/schema";
import { type Schema } from "@/services/firebase/firestore/schema";

function applyOperations(service: FirestoreService, batch: Batch, operations: HistoryOperation[]): void {
  for (const op of operations) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const col = collection(service.firestore, op.collection) as CollectionReference<any>;

    switch (op.type) {
      case "set":
        batch.set(col, { id: op.id, ...op.data });
        break;
      case "update":
        batch.update(col, { id: op.id, ...op.data });
        break;
      case "delete":
        batch.delete(col, op.id);
        break;
    }
  }
}

export async function getChildren(
  service: FirestoreService,
  parentEntryId: string,
): Promise<DocumentData<Schema["editHistory"]>[]> {
  const editHistoryCol = getCollection(service, "editHistory");
  const children = await getDocs(service, query(editHistoryCol, where("parentId", "==", parentEntryId)));
  return children.sort((a, b) => a.id.localeCompare(b.id));
}

export async function undo(service: FirestoreService): Promise<HistorySelection | undefined> {
  const head = service.editHistoryHead$();
  if (!head || head.entryId === "") return undefined;

  const editHistoryCol = getCollection(service, "editHistory");
  const entry = await getDoc(service, editHistoryCol, head.entryId);
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

  return entry.prevSelection;
}

export async function redo(service: FirestoreService, childId?: string): Promise<HistorySelection | undefined> {
  const head = service.editHistoryHead$();
  const currentEntryId = head?.entryId ?? "";

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
      if (head) {
        batch.updateSingleton(editHistoryHeadCol, { entryId: targetChild.id });
      } else {
        batch.setSingleton(editHistoryHeadCol, { entryId: targetChild.id });
      }
      return Promise.resolve();
    },
    { skipHistory: true },
  );

  return targetChild.nextSelection;
}

async function buildAncestorChain(
  service: FirestoreService,
  col: CollectionReference<Schema["editHistory"]>,
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

export async function jumpTo(service: FirestoreService, targetId: string): Promise<HistorySelection | undefined> {
  const head = service.editHistoryHead$();
  const currentId = head?.entryId ?? "";

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
      if (head) {
        batch.updateSingleton(editHistoryHeadCol, { entryId: targetId });
      } else {
        batch.setSingleton(editHistoryHeadCol, { entryId: targetId });
      }
      return Promise.resolve();
    },
    { skipHistory: true },
  );

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
