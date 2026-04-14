import { type Timestamp } from "firebase/firestore";

import { type Schema, type Timestamps } from "@/services/firebase/firestore/schema";

export type HistoryOperationCollection = Exclude<keyof Schema, "editHistory" | "editHistoryHead">;

export type HistoryOperationOf<C extends HistoryOperationCollection> =
  | { type: "set"; collection: C; id: string; data: Omit<Schema[C], keyof Timestamps> }
  | { type: "update"; collection: C; id: string; data: Partial<Omit<Schema[C], keyof Timestamps>> }
  | { type: "delete"; collection: C; id: string };

export type HistoryOperation = {
  [C in HistoryOperationCollection]: HistoryOperationOf<C>;
}[HistoryOperationCollection];

export type HistorySelection = Partial<Record<keyof Schema, string>>;

export function buildSelection(state: {
  panesLifeLogs: { selectedLifeLogId: string; selectedLifeLogNodeId: string };
}): HistorySelection {
  const selection: HistorySelection = {};
  if (state.panesLifeLogs.selectedLifeLogId) selection.lifeLogs = state.panesLifeLogs.selectedLifeLogId;
  if (state.panesLifeLogs.selectedLifeLogNodeId) selection.lifeLogTreeNodes = state.panesLifeLogs.selectedLifeLogNodeId;
  return selection;
}

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    editHistory: {
      parentId: string;
      description: string;
      operations: HistoryOperation[];
      inverseOperations: HistoryOperation[];
      prevSelection: HistorySelection;
      nextSelection: HistorySelection;

      createdAt: Timestamp;
      updatedAt: Timestamp;
    };

    editHistoryHead: {
      entryId: string;

      createdAt: Timestamp;
      updatedAt: Timestamp;
    };
  }
}
