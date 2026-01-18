import { createContextProvider } from "@solid-primitives/context";
import { Timestamp } from "firebase/firestore";
import { startTransition } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { uuidv7 } from "uuidv7";

import { DateNow } from "@/date";
import { EditingField } from "@/panes/lifeLogs/schema";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch, setDoc, updateDoc } from "@/services/firebase/firestore/batch";
import { addNextSibling, addPrevSibling, addSingle, getFirstChildNode } from "@/services/firebase/firestore/treeNode";
import { useStoreService } from "@/services/store";
import { noneTimestamp } from "@/timestamp";

export interface ActionsContext {
  isEditing: boolean;
  isLifeLogSelected: boolean;
  isLifeLogTreeFocused: boolean;
  hasSelection: boolean;
  editingField: EditingField;
  id: string;
  prevId: string;
  nextId: string;
  firstId: string;
  lastId: string;
  selectedNodeId: string;

  // Callbacks (set by LifeLogTree)
  setIsEditing: (v: boolean) => void;
  setEditingField: (field: EditingField) => void;
  setSelectedNodeId: (id: string) => void;
}

const initialActionsContext: ActionsContext = {
  isEditing: false,
  isLifeLogSelected: false,
  isLifeLogTreeFocused: false,
  hasSelection: false,
  editingField: EditingField.Text,
  id: "",
  prevId: "",
  nextId: "",
  firstId: "",
  lastId: "",
  selectedNodeId: "",
  setIsEditing: () => undefined,
  setEditingField: () => undefined,
  setSelectedNodeId: () => undefined,
};

export interface Actions {
  context: ActionsContext;
  updateContext: (updater: (ctx: ActionsContext) => void) => void;
  // Actions
  navigateNext: () => void;
  navigatePrev: () => void;
  goToFirst: () => void;
  goToLast: () => void;
  enterTree: () => Promise<void>;
  exitTree: () => void;
  newLifeLog: () => Promise<void>;
  addSiblingNode: (above: boolean) => Promise<void>;
  setStartAtNow: () => Promise<void>;
  setEndAtNow: () => Promise<void>;
  startEditing: () => void;
  cycleFieldNext: () => void;
  cycleFieldPrev: () => void;
}

const [ActionsProvider_, useActions_] = createContextProvider(() => {
  const [context, setContext] = createStore<ActionsContext>({ ...initialActionsContext });
  const { updateState } = useStoreService();
  const firestore = useFirestoreService();

  function updateContext(updater: (ctx: ActionsContext) => void): void {
    setContext(produce(updater));
  }

  // Navigation actions
  function navigateNext() {
    if (context.isLifeLogTreeFocused || context.nextId === "") return;
    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogId = context.nextId;
    });
  }

  function navigatePrev() {
    if (context.isLifeLogTreeFocused || context.prevId === "") return;
    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogId = context.prevId;
    });
  }

  function goToFirst() {
    if (context.isLifeLogTreeFocused || context.firstId === "" || context.id === context.firstId) return;
    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogId = context.firstId;
    });
  }

  function goToLast() {
    if (context.isLifeLogTreeFocused || context.lastId === "" || context.id === context.lastId) return;
    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogId = context.lastId;
    });
  }

  // Tree navigation
  async function enterTree() {
    if (context.isLifeLogTreeFocused) return;

    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");

    const lifeLog = await getDoc(firestore, lifeLogsCol, context.id);
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
        context.setSelectedNodeId(id);
        firestore.setClock(false);
      });
    }
  }

  function exitTree() {
    if (context.isLifeLogSelected) return;
    context.setSelectedNodeId("");
  }

  // LifeLog creation
  async function newLifeLog() {
    if (context.isLifeLogTreeFocused) return;

    const lifeLogsCol = getCollection(firestore, "lifeLogs");

    const lifeLog = await getDoc(firestore, lifeLogsCol, context.id);
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
        context.setIsEditing(true);
        context.setEditingField(EditingField.Text);
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  async function addSiblingNode(above: boolean) {
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");

    if (context.isLifeLogTreeFocused) {
      // Tree is focused: add sibling node
      const node = await getDoc(firestore, lifeLogTreeNodesCol, context.selectedNodeId);
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
          context.setSelectedNodeId(newNodeId);
          context.setIsEditing(true);
          firestore.setClock(false);
        });
      } finally {
        firestore.setClock(false);
      }
    } else {
      // LifeLog is focused: add new LifeLog (only for below)
      if (above) return;

      const lifeLog = await getDoc(firestore, lifeLogsCol, context.id);
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

          context.setIsEditing(true);
          context.setEditingField(EditingField.Text);

          firestore.setClock(false);
        });
      } finally {
        firestore.setClock(false);
      }
    }
  }

  // Time operations
  async function setStartAtNow() {
    if (context.isLifeLogTreeFocused) return;

    const lifeLogsCol = getCollection(firestore, "lifeLogs");

    const lifeLog = await getDoc(firestore, lifeLogsCol, context.id);
    if (!lifeLog || !lifeLog.startAt.isEqual(noneTimestamp)) return;

    const newTimestamp = Timestamp.fromMillis(Math.floor(DateNow() / 1000) * 1000);

    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogsCol, {
          id: context.id,
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

  async function setEndAtNow() {
    if (context.isLifeLogTreeFocused) return;

    const lifeLogsCol = getCollection(firestore, "lifeLogs");

    const lifeLog = await getDoc(firestore, lifeLogsCol, context.id);
    if (!lifeLog || !lifeLog.endAt.isEqual(noneTimestamp)) return;

    const newTimestamp = Timestamp.fromMillis(Math.floor(DateNow() / 1000) * 1000);

    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogsCol, {
          id: context.id,
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
  function startEditing() {
    context.setIsEditing(true);
    if (context.isLifeLogSelected) {
      context.setEditingField(EditingField.Text);
    }
  }

  function cycleFieldNext() {
    const fields = [EditingField.Text, EditingField.StartAt, EditingField.EndAt];
    const currentIndex = fields.indexOf(context.editingField);
    const nextIndex = currentIndex < fields.length - 1 ? currentIndex + 1 : 0;
    context.setEditingField(fields[nextIndex]);
  }

  function cycleFieldPrev() {
    const fields = [EditingField.Text, EditingField.StartAt, EditingField.EndAt];
    const currentIndex = fields.indexOf(context.editingField);
    const nextIndex = currentIndex > 0 ? currentIndex - 1 : fields.length - 1;
    context.setEditingField(fields[nextIndex]);
  }

  return {
    context,
    updateContext,
    navigateNext,
    navigatePrev,
    goToFirst,
    goToLast,
    enterTree,
    exitTree,
    newLifeLog,
    addSiblingNode,
    setStartAtNow,
    setEndAtNow,
    startEditing,
    cycleFieldNext,
    cycleFieldPrev,
  };
});

export { ActionsProvider_ as ActionsProvider };

export function useActions(): Actions {
  const actions = useActions_();
  if (!actions) {
    throw new Error("useActions must be used within ActionsProvider");
  }
  return actions;
}
