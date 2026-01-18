import { doc, Timestamp } from "firebase/firestore";
import { startTransition } from "solid-js";
import { uuidv7 } from "uuidv7";

import { DateNow } from "@/date";
import { EditingField } from "@/panes/lifeLogs/schema";
import { actionsCreator, initialActionsContext } from "@/services/actions";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch, setDoc, updateDoc } from "@/services/firebase/firestore/batch";
import { addNextSibling, addPrevSibling, addSingle, getFirstChildNode } from "@/services/firebase/firestore/treeNode";
import { useStoreService } from "@/services/store";
import { noneTimestamp } from "@/timestamp";

declare module "@/services/actions" {
  interface PanesActionsContext {
    lifeLogs: {
      isEditing: boolean;
      editingField: EditingField;
      prevId: string;
      nextId: string;
      firstId: string;
      lastId: string;

      // Callbacks (set by LifeLogTree)
      setIsEditing: (v: boolean) => void;
      setEditingField: (field: EditingField) => void;
      setLifeLogCursorInfo: (info: { lifeLogId: string; cursorPosition: number } | undefined) => void;
    };
  }

  interface PanesActions {
    lifeLogs: {
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
      saveText: (newText: string) => Promise<void>;
      saveStartAt: (newTimestamp: Timestamp) => Promise<void>;
      saveEndAt: (newTimestamp: Timestamp) => Promise<void>;
      deleteEmptyLifeLogToPrev: () => Promise<void>;
      deleteEmptyLifeLogToNext: () => Promise<void>;
    };
  }
}

initialActionsContext.panes.lifeLogs = {
  isEditing: false,
  editingField: EditingField.Text,
  prevId: "",
  nextId: "",
  firstId: "",
  lastId: "",
  setIsEditing: () => undefined,
  setEditingField: () => undefined,
  setLifeLogCursorInfo: () => undefined,
};

actionsCreator.panes.lifeLogs = ({ panes: { lifeLogs: context } }) => {
  const { state, updateState } = useStoreService();
  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");

  // Navigation actions
  function navigateNext() {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "" || context.nextId === "") return;
    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogId = context.nextId;
    });
  }

  function navigatePrev() {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "" || context.prevId === "") return;
    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogId = context.prevId;
    });
  }

  function goToFirst() {
    if (
      state.panesLifeLogs.selectedLifeLogNodeId !== "" ||
      context.firstId === "" ||
      state.panesLifeLogs.selectedLifeLogId === context.firstId
    )
      return;
    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogId = context.firstId;
    });
  }

  function goToLast() {
    if (
      state.panesLifeLogs.selectedLifeLogNodeId !== "" ||
      context.lastId === "" ||
      state.panesLifeLogs.selectedLifeLogId === context.lastId
    )
      return;
    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogId = context.lastId;
    });
  }

  // Tree navigation
  async function enterTree() {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");

    const lifeLog = await getDoc(firestore, lifeLogsCol, state.panesLifeLogs.selectedLifeLogId);
    if (!lifeLog) return;

    const firstChildNode = await getFirstChildNode(firestore, lifeLogTreeNodesCol, lifeLog);
    let nodeId = "";

    firestore.setClock(true);
    try {
      if (firstChildNode) {
        nodeId = firstChildNode.id;
      } else {
        nodeId = uuidv7();
        await runBatch(firestore, (batch) => {
          addSingle(firestore, batch, lifeLogTreeNodesCol, lifeLog.id, {
            id: nodeId,
            text: "new",
          });
          return Promise.resolve();
        });
      }
    } finally {
      await startTransition(() => {
        updateState((s) => {
          s.panesLifeLogs.selectedLifeLogNodeId = nodeId;
        });
        firestore.setClock(false);
      });
    }
  }

  function exitTree() {
    if (state.panesLifeLogs.selectedLifeLogNodeId === "") return;
    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogNodeId = "";
    });
  }

  // LifeLog creation
  async function newLifeLog() {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const lifeLog = await getDoc(firestore, lifeLogsCol, state.panesLifeLogs.selectedLifeLogId);
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
    const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");

    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") {
      // Tree is focused: add sibling node
      const node = await getDoc(firestore, lifeLogTreeNodesCol, state.panesLifeLogs.selectedLifeLogNodeId);
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
          updateState((s) => {
            s.panesLifeLogs.selectedLifeLogNodeId = newNodeId;
          });
          context.setIsEditing(true);
          firestore.setClock(false);
        });
      } finally {
        firestore.setClock(false);
      }
    } else {
      // LifeLog is focused: add new LifeLog (only for below)
      if (above) return;

      const lifeLog = await getDoc(firestore, lifeLogsCol, state.panesLifeLogs.selectedLifeLogId);
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
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const selectedLifeLogId = state.panesLifeLogs.selectedLifeLogId;

    const lifeLog = await getDoc(firestore, lifeLogsCol, selectedLifeLogId);
    if (!lifeLog || !lifeLog.startAt.isEqual(noneTimestamp)) return;

    const newTimestamp = Timestamp.fromMillis(Math.floor(DateNow() / 1000) * 1000);

    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogsCol, {
          id: selectedLifeLogId,
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
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const selectedLifeLogId = state.panesLifeLogs.selectedLifeLogId;

    const lifeLog = await getDoc(firestore, lifeLogsCol, selectedLifeLogId);
    if (!lifeLog || !lifeLog.endAt.isEqual(noneTimestamp)) return;

    const newTimestamp = Timestamp.fromMillis(Math.floor(DateNow() / 1000) * 1000);

    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogsCol, {
          id: selectedLifeLogId,
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
    if (state.panesLifeLogs.selectedLifeLogId !== "" && state.panesLifeLogs.selectedLifeLogNodeId === "") {
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

  // Save operations for editable fields
  async function saveText(newText: string) {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const selectedLifeLogId = state.panesLifeLogs.selectedLifeLogId;
    if (selectedLifeLogId === "") return;

    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogsCol, {
          id: selectedLifeLogId,
          text: newText,
        });
        return Promise.resolve();
      });
    } finally {
      await startTransition(() => {
        firestore.setClock(false);
      });
    }
  }

  async function saveStartAt(newTimestamp: Timestamp) {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const selectedLifeLogId = state.panesLifeLogs.selectedLifeLogId;
    if (selectedLifeLogId === "") return;

    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogsCol, {
          id: selectedLifeLogId,
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

  async function saveEndAt(newTimestamp: Timestamp) {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const selectedLifeLogId = state.panesLifeLogs.selectedLifeLogId;
    if (selectedLifeLogId === "") return;

    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogsCol, {
          id: selectedLifeLogId,
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

  // Delete operations for empty LifeLogs
  async function deleteEmptyLifeLogToPrev() {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const selectedLifeLogId = state.panesLifeLogs.selectedLifeLogId;
    if (selectedLifeLogId === "" || context.prevId === "") return;

    const lifeLog = await getDoc(firestore, lifeLogsCol, selectedLifeLogId);
    if (!lifeLog) return;

    // Check conditions for deletion: text empty, timestamps = none
    if (lifeLog.text !== "" || !lifeLog.startAt.isEqual(noneTimestamp) || !lifeLog.endAt.isEqual(noneTimestamp)) {
      return;
    }

    // Check for child tree nodes
    const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const hasChildren = await getFirstChildNode(firestore, lifeLogTreeNodesCol, lifeLog);
    if (hasChildren) return;

    // Get previous LifeLog's text length for cursor position
    const prevLifeLog = await getDoc(firestore, lifeLogsCol, context.prevId);
    if (!prevLifeLog) return;

    const cursorPosition = prevLifeLog.text.length;

    // Delete current LifeLog and select previous
    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        batch.delete(doc(lifeLogsCol, selectedLifeLogId));
        return Promise.resolve();
      });

      context.setLifeLogCursorInfo({ lifeLogId: context.prevId, cursorPosition });
      // Save setIsEditing reference before updateState triggers onCleanup which resets it
      const setIsEditing = context.setIsEditing;
      await startTransition(() => {
        // IMPORTANT: Call setIsEditing(true) BEFORE updateState, because updateState
        // will trigger the old EditableValue to lose focus and call setIsEditing(false)
        setIsEditing(true);
        updateState((state) => {
          state.panesLifeLogs.selectedLifeLogId = context.prevId;
        });
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  async function deleteEmptyLifeLogToNext() {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const selectedLifeLogId = state.panesLifeLogs.selectedLifeLogId;
    if (selectedLifeLogId === "" || context.nextId === "") return;

    const lifeLog = await getDoc(firestore, lifeLogsCol, selectedLifeLogId);
    if (!lifeLog) return;

    // Check conditions for deletion: text empty, timestamps = none
    if (lifeLog.text !== "" || !lifeLog.startAt.isEqual(noneTimestamp) || !lifeLog.endAt.isEqual(noneTimestamp)) {
      return;
    }

    // Check for child tree nodes
    const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const hasChildren = await getFirstChildNode(firestore, lifeLogTreeNodesCol, lifeLog);
    if (hasChildren) return;

    // Delete current LifeLog and select next with cursor at start
    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        batch.delete(doc(lifeLogsCol, selectedLifeLogId));
        return Promise.resolve();
      });

      context.setLifeLogCursorInfo({ lifeLogId: context.nextId, cursorPosition: 0 });
      // Save setIsEditing reference before updateState triggers onCleanup which resets it
      const setIsEditing = context.setIsEditing;
      await startTransition(() => {
        // IMPORTANT: Call setIsEditing(true) BEFORE updateState, because updateState
        // will trigger the old EditableValue to lose focus and call setIsEditing(false)
        setIsEditing(true);
        updateState((state) => {
          state.panesLifeLogs.selectedLifeLogId = context.nextId;
        });
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  return {
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
    saveText,
    saveStartAt,
    saveEndAt,
    deleteEmptyLifeLogToPrev,
    deleteEmptyLifeLogToNext,
  };
};
