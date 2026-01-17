import { createContextProvider } from "@solid-primitives/context";
import { Timestamp } from "firebase/firestore";
import { type Accessor, createSignal, startTransition } from "solid-js";
import { uuidv7 } from "uuidv7";

import { DateNow } from "@/date";
import { EditingField } from "@/panes/lifeLogs/schema";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch, setDoc, updateDoc } from "@/services/firebase/firestore/batch";
import { addNextSibling, addPrevSibling, addSingle, getFirstChildNode } from "@/services/firebase/firestore/treeNode";
import { useStoreService } from "@/services/store";
import { noneTimestamp } from "@/timestamp";

export interface ActionsContextState {
  // State (reactive - use accessor pattern for reading)
  isEditing$: Accessor<boolean>;
  isLifeLogSelected$: Accessor<boolean>;
  isLifeLogTreeFocused$: Accessor<boolean>;
  hasSelection$: Accessor<boolean>;
  editingField$: Accessor<EditingField>;
  // Navigation IDs (reactive)
  id$: Accessor<string>;
  prevId$: Accessor<string>;
  nextId$: Accessor<string>;
  firstId$: Accessor<string>;
  lastId$: Accessor<string>;
  selectedNodeId$: Accessor<string>;
  // Callbacks
  setIsEditing: (v: boolean) => void;
  setEditingField: (field: EditingField) => void;
  setSelectedNodeId: (id: string) => void;
}

// Internal setters for signals (not exported)
interface ActionsContextInternal extends ActionsContextState {
  _setIsEditing: (v: boolean) => void;
  _setIsLifeLogSelected: (v: boolean) => void;
  _setIsLifeLogTreeFocused: (v: boolean) => void;
  _setHasSelection: (v: boolean) => void;
  _setEditingField: (f: EditingField) => void;
  _setId: (v: string) => void;
  _setPrevId: (v: string) => void;
  _setNextId: (v: string) => void;
  _setFirstId: (v: string) => void;
  _setLastId: (v: string) => void;
  _setSelectedNodeId: (v: string) => void;
}

const [ActionsProvider_, useActionsContext_] = createContextProvider(() => {
  const [isEditing$, _setIsEditing] = createSignal(false);
  const [isLifeLogSelected$, _setIsLifeLogSelected] = createSignal(false);
  const [isLifeLogTreeFocused$, _setIsLifeLogTreeFocused] = createSignal(false);
  const [hasSelection$, _setHasSelection] = createSignal(false);
  const [editingField$, _setEditingField] = createSignal<EditingField>(EditingField.Text);
  const [id$, _setId] = createSignal("");
  const [prevId$, _setPrevId] = createSignal("");
  const [nextId$, _setNextId] = createSignal("");
  const [firstId$, _setFirstId] = createSignal("");
  const [lastId$, _setLastId] = createSignal("");
  const [selectedNodeId$, _setSelectedNodeId] = createSignal("");

  const ctx: ActionsContextInternal = {
    isEditing$,
    isLifeLogSelected$,
    isLifeLogTreeFocused$,
    hasSelection$,
    editingField$,
    id$,
    prevId$,
    nextId$,
    firstId$,
    lastId$,
    selectedNodeId$,
    // External callbacks (initially no-op, set by LifeLogTree)
    setIsEditing: (_v: boolean) => undefined,
    setEditingField: (_field: EditingField) => undefined,
    setSelectedNodeId: (_id: string) => undefined,
    // Internal setters
    _setIsEditing,
    _setIsLifeLogSelected,
    _setIsLifeLogTreeFocused,
    _setHasSelection,
    _setEditingField,
    _setId,
    _setPrevId,
    _setNextId,
    _setFirstId,
    _setLastId,
    _setSelectedNodeId,
  };

  return ctx;
});

export { ActionsProvider_ as ActionsProvider };

export function useActionsContext(): ActionsContextState {
  const context = useActionsContext_();
  if (!context) {
    throw new Error("useActionsContext must be used within ActionsProvider");
  }
  return context;
}

// Update context values and callbacks
export interface SetActionsContextInput {
  isEditing?: boolean;
  isLifeLogSelected?: boolean;
  isLifeLogTreeFocused?: boolean;
  hasSelection?: boolean;
  editingField?: EditingField;
  id?: string;
  prevId?: string;
  nextId?: string;
  firstId?: string;
  lastId?: string;
  selectedNodeId?: string;
  setIsEditing?: (v: boolean) => void;
  setEditingField?: (field: EditingField) => void;
  setSelectedNodeId?: (id: string) => void;
}

export function useSetActionsContext(): (newCtx: SetActionsContextInput) => void {
  const context = useActionsContext_();
  return (newCtx: SetActionsContextInput) => {
    if (!context) {
      return;
    }
    // Update signal values
    if (newCtx.isEditing !== undefined) context._setIsEditing(newCtx.isEditing);
    if (newCtx.isLifeLogSelected !== undefined) context._setIsLifeLogSelected(newCtx.isLifeLogSelected);
    if (newCtx.isLifeLogTreeFocused !== undefined) context._setIsLifeLogTreeFocused(newCtx.isLifeLogTreeFocused);
    if (newCtx.hasSelection !== undefined) context._setHasSelection(newCtx.hasSelection);
    if (newCtx.editingField !== undefined) context._setEditingField(newCtx.editingField);
    if (newCtx.id !== undefined) context._setId(newCtx.id);
    if (newCtx.prevId !== undefined) context._setPrevId(newCtx.prevId);
    if (newCtx.nextId !== undefined) context._setNextId(newCtx.nextId);
    if (newCtx.firstId !== undefined) context._setFirstId(newCtx.firstId);
    if (newCtx.lastId !== undefined) context._setLastId(newCtx.lastId);
    if (newCtx.selectedNodeId !== undefined) context._setSelectedNodeId(newCtx.selectedNodeId);
    // Update callbacks
    if (newCtx.setIsEditing !== undefined) context.setIsEditing = newCtx.setIsEditing;
    if (newCtx.setEditingField !== undefined) context.setEditingField = newCtx.setEditingField;
    if (newCtx.setSelectedNodeId !== undefined) context.setSelectedNodeId = newCtx.setSelectedNodeId;
  };
}

// Navigation actions
export function navigateNext() {
  const ctx = useActionsContext();
  const { updateState } = useStoreService();
  if (ctx.isLifeLogTreeFocused$() || ctx.nextId$() === "") return;
  updateState((s) => {
    s.panesLifeLogs.selectedLifeLogId = ctx.nextId$();
  });
}

export function navigatePrev() {
  const ctx = useActionsContext();
  const { updateState } = useStoreService();
  if (ctx.isLifeLogTreeFocused$() || ctx.prevId$() === "") return;
  updateState((s) => {
    s.panesLifeLogs.selectedLifeLogId = ctx.prevId$();
  });
}

export function goToFirst() {
  const ctx = useActionsContext();
  const { updateState } = useStoreService();
  if (ctx.isLifeLogTreeFocused$() || ctx.firstId$() === "" || ctx.id$() === ctx.firstId$()) return;
  updateState((s) => {
    s.panesLifeLogs.selectedLifeLogId = ctx.firstId$();
  });
}

export function goToLast() {
  const ctx = useActionsContext();
  const { updateState } = useStoreService();
  if (ctx.isLifeLogTreeFocused$() || ctx.lastId$() === "" || ctx.id$() === ctx.lastId$()) return;
  updateState((s) => {
    s.panesLifeLogs.selectedLifeLogId = ctx.lastId$();
  });
}

// Tree navigation
export async function enterTree() {
  const ctx = useActionsContext();
  if (ctx.isLifeLogTreeFocused$()) return;

  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");
  const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");

  const lifeLog = await getDoc(firestore, lifeLogsCol, ctx.id$());
  if (!lifeLog) return;

  const firstChildNode = await getFirstChildNode(firestore, lifeLogTreeNodesCol, lifeLog);
  let id = "";

  firestore.setClock(true);
  try {
    if (firstChildNode) {
      id = firstChildNode.id;
    } else {
      id = uuidv7();
      await runBatch(firestore, (batch) => {
        addSingle(firestore, batch, lifeLogTreeNodesCol, lifeLog.id, {
          id,
          text: "new",
        });
        return Promise.resolve();
      });
    }
  } finally {
    await startTransition(() => {
      ctx.setSelectedNodeId(id);
      firestore.setClock(false);
    });
  }
}

export function exitTree() {
  const ctx = useActionsContext();
  if (ctx.isLifeLogSelected$()) return;
  ctx.setSelectedNodeId("");
}

// LifeLog creation
export async function newLifeLog() {
  const ctx = useActionsContext();
  const { updateState } = useStoreService();
  if (ctx.isLifeLogTreeFocused$()) return;

  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");

  const lifeLog = await getDoc(firestore, lifeLogsCol, ctx.id$());
  if (!lifeLog) return;

  const newLifeLogId = uuidv7();

  firestore.setClock(true);
  try {
    await runBatch(firestore, (batch) => {
      setDoc(firestore, batch, lifeLogsCol, {
        id: newLifeLogId,
        text: "",
        startAt: lifeLog.endAt,
        endAt: noneTimestamp,
      });
      return Promise.resolve();
    });

    await startTransition(() => {
      updateState((state) => {
        state.panesLifeLogs.selectedLifeLogId = newLifeLogId;
        state.panesLifeLogs.selectedLifeLogNodeId = "";
      });
      ctx.setIsEditing(true);
      ctx.setEditingField(EditingField.Text);
      firestore.setClock(false);
    });
  } finally {
    firestore.setClock(false);
  }
}

export async function addSiblingNode(above: boolean) {
  const ctx = useActionsContext();
  const { updateState } = useStoreService();

  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");
  const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");

  if (ctx.isLifeLogTreeFocused$()) {
    // Tree is focused: add sibling node
    const node = await getDoc(firestore, lifeLogTreeNodesCol, ctx.selectedNodeId$());
    if (!node) return;

    const newNodeId = uuidv7();

    try {
      firestore.setClock(true);
      await runBatch(firestore, async (batch) => {
        if (above) {
          await addPrevSibling(firestore, batch, lifeLogTreeNodesCol, node, { id: newNodeId, text: "" });
        } else {
          await addNextSibling(firestore, batch, lifeLogTreeNodesCol, node, { id: newNodeId, text: "" });
        }
      });

      await startTransition(() => {
        ctx.setSelectedNodeId(newNodeId);
        ctx.setIsEditing(true);
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  } else {
    // LifeLog is focused: add new LifeLog (only for below)
    if (above) return;

    const lifeLog = await getDoc(firestore, lifeLogsCol, ctx.id$());
    if (!lifeLog) return;

    const newLifeLogId = uuidv7();

    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        setDoc(firestore, batch, lifeLogsCol, {
          id: newLifeLogId,
          text: "",
          startAt: lifeLog.endAt,
          endAt: noneTimestamp,
        });
        return Promise.resolve();
      });

      await startTransition(() => {
        updateState((state) => {
          state.panesLifeLogs.selectedLifeLogId = newLifeLogId;
          state.panesLifeLogs.selectedLifeLogNodeId = "";
        });

        ctx.setIsEditing(true);
        ctx.setEditingField(EditingField.Text);

        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }
}

// Time operations
export async function setStartAtNow() {
  const ctx = useActionsContext();
  if (ctx.isLifeLogTreeFocused$()) return;

  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");

  const lifeLog = await getDoc(firestore, lifeLogsCol, ctx.id$());
  if (!lifeLog || !lifeLog.startAt.isEqual(noneTimestamp)) return;

  const newTimestamp = Timestamp.fromMillis(Math.floor(DateNow() / 1000) * 1000);

  firestore.setClock(true);
  try {
    await runBatch(firestore, (batch) => {
      updateDoc(firestore, batch, lifeLogsCol, {
        id: ctx.id$(),
        startAt: newTimestamp,
      });
      return Promise.resolve();
    });
  } finally {
    await startTransition(() => {
      firestore.setClock(false);
    });
  }
}

export async function setEndAtNow() {
  const ctx = useActionsContext();
  if (ctx.isLifeLogTreeFocused$()) return;

  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");

  const lifeLog = await getDoc(firestore, lifeLogsCol, ctx.id$());
  if (!lifeLog || !lifeLog.endAt.isEqual(noneTimestamp)) return;

  const newTimestamp = Timestamp.fromMillis(Math.floor(DateNow() / 1000) * 1000);

  firestore.setClock(true);
  try {
    await runBatch(firestore, (batch) => {
      updateDoc(firestore, batch, lifeLogsCol, {
        id: ctx.id$(),
        endAt: newTimestamp,
      });
      return Promise.resolve();
    });
  } finally {
    await startTransition(() => {
      firestore.setClock(false);
    });
  }
}

// Editing
export function startEditing() {
  const ctx = useActionsContext();
  ctx.setIsEditing(true);
  if (ctx.isLifeLogSelected$()) {
    ctx.setEditingField(EditingField.Text);
  }
}

export function cycleFieldNext() {
  const ctx = useActionsContext();
  const fields = [EditingField.Text, EditingField.StartAt, EditingField.EndAt];
  const currentIndex = fields.indexOf(ctx.editingField$());
  const nextIndex = currentIndex < fields.length - 1 ? currentIndex + 1 : 0;
  ctx.setEditingField(fields[nextIndex]);
}

export function cycleFieldPrev() {
  const ctx = useActionsContext();
  const fields = [EditingField.Text, EditingField.StartAt, EditingField.EndAt];
  const currentIndex = fields.indexOf(ctx.editingField$());
  const nextIndex = currentIndex > 0 ? currentIndex - 1 : fields.length - 1;
  ctx.setEditingField(fields[nextIndex]);
}
