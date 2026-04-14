import { type Timestamp } from "firebase/firestore";

import { type Schema } from "@/services/firebase/firestore/schema";

export type HistoryOperation =
  | { type: "set"; collection: string; id: string; data: Record<string, unknown> }
  | { type: "update"; collection: string; id: string; data: Record<string, unknown> }
  | { type: "delete"; collection: string; id: string };

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
