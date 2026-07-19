import { type Selection, type WriteOp } from "./types";

// Assembles the editHistory document body (undo/redo linked-list entry). The
// caller attaches id/createdAt/updatedAt. Generic over the op and selection
// types so the Web side can pass its stricter `HistoryOperation`/
// `HistorySelection` (defaulting to the structural contract types the Worker
// uses) and get them back unchanged — no casts at either call site.
export function buildHistoryEntry<Op = WriteOp, Sel = Selection>(args: {
  parentId: string;
  description: string;
  operations: Op[];
  inverseOperations: Op[];
  prevSelection: Sel;
  nextSelection: Sel;
}): {
  parentId: string;
  description: string;
  operations: Op[];
  inverseOperations: Op[];
  prevSelection: Sel;
  nextSelection: Sel;
} {
  return {
    parentId: args.parentId,
    description: args.description,
    operations: args.operations,
    inverseOperations: args.inverseOperations,
    prevSelection: args.prevSelection,
    nextSelection: args.nextSelection,
  };
}
