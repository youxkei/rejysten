import { doc, Timestamp } from "firebase/firestore";
import { startTransition } from "solid-js";
import { uuidv7 } from "uuidv7";

import { DateNow, TimestampNow } from "@/date";
import { EditingField } from "@/panes/lifeLogs/schema";
import { type Actions, actionsCreator, initialActionsContext } from "@/services/actions";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch, setDoc, updateDoc } from "@/services/firebase/firestore/batch";
import { deleteNgram } from "@/services/firebase/firestore/ngram";
import {
  addNextSibling,
  addPrevSibling,
  addSingle,
  getAboveNode,
  getBelowNode,
  getFirstChildNode,
  getNextNode,
  getPrevNode,
  remove,
} from "@/services/firebase/firestore/treeNode";
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

      // Pending values for save operations (LifeLog)
      pendingText: string | undefined;
      pendingStartAt: Timestamp | undefined;
      pendingEndAt: Timestamp | undefined;

      // Tree node data (constantly updated)
      lifeLogTextLength: number;
      pendingNodeText: string | undefined;
      nodeCursorPosition: number;

      // Callbacks (set by LifeLog)
      setIsEditing: (v: boolean) => void;
      setEditingField: (field: EditingField) => void;
      setLifeLogCursorInfo: (info: { lifeLogId: string; cursorPosition: number } | undefined) => void;
      setEnterSplitNodeId: (id: string | undefined) => void;
      setTabCursorInfo: (info: { nodeId: string; cursorPosition: number } | undefined) => void;
      setMergeCursorInfo: (info: { nodeId: string; cursorPosition: number } | undefined) => void;
      updateNodeInput: (text: string, cursorPosition: number) => void;
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
      saveText: () => Promise<void>;
      saveStartAt: () => Promise<void>;
      saveEndAt: () => Promise<void>;
      deleteEmptyLifeLogToPrev: () => Promise<void>;
      deleteEmptyLifeLogToNext: () => Promise<void>;
      createFirstLifeLog: () => Promise<void>;

      // Tree node actions
      saveTreeNode: () => Promise<void>;
      splitTreeNode: () => Promise<void>;
      removeOrMergeNodeWithAbove: () => Promise<void>;
      mergeTreeNodeWithBelow: () => Promise<void>;
      saveAndIndentTreeNode: () => Promise<void>;
      saveAndDedentTreeNode: () => Promise<void>;
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
  pendingText: undefined,
  pendingStartAt: undefined,
  pendingEndAt: undefined,
  lifeLogTextLength: 0,
  pendingNodeText: undefined,
  nodeCursorPosition: 0,
  setIsEditing: () => undefined,
  setEditingField: () => undefined,
  setLifeLogCursorInfo: () => undefined,
  setEnterSplitNodeId: () => undefined,
  setTabCursorInfo: () => undefined,
  setMergeCursorInfo: () => undefined,
  updateNodeInput: () => undefined,
};

actionsCreator.panes.lifeLogs = ({ panes: { lifeLogs: context } }, actions: Actions) => {
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

    if (lifeLog.hasTreeNodes) {
      // ツリーノードが存在する場合は "__FIRST__" をセット
      // ChildrenNodes がロード時に実際のIDに解決する
      await startTransition(() => {
        updateState((s) => {
          s.panesLifeLogs.selectedLifeLogNodeId = "__FIRST__";
        });
      });
    } else {
      // hasTreeNodes === false: 新規ノード作成
      const nodeId = uuidv7();
      firestore.setClock(true);
      try {
        await runBatch(firestore, (batch) => {
          addSingle(firestore, batch, lifeLogTreeNodesCol, lifeLog.id, {
            id: nodeId,
            text: "",
            lifeLogId: lifeLog.id,
          });
          updateDoc(firestore, batch, lifeLogsCol, {
            id: lifeLog.id,
            hasTreeNodes: true,
          });
          return Promise.resolve();
        });
      } finally {
        await startTransition(() => {
          updateState((s) => {
            s.panesLifeLogs.selectedLifeLogNodeId = nodeId;
          });
          firestore.setClock(false);
        });
      }
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
          hasTreeNodes: false,
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
            await addPrevSibling(firestore, batch, lifeLogTreeNodesCol, node, {
              id: newNodeId,
              text: "",
              lifeLogId: state.panesLifeLogs.selectedLifeLogId,
            });
          } else {
            await addNextSibling(firestore, batch, lifeLogTreeNodesCol, node, {
              id: newNodeId,
              text: "",
              lifeLogId: state.panesLifeLogs.selectedLifeLogId,
            });
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
            hasTreeNodes: false,
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
    const lifeLogId = state.panesLifeLogs.selectedLifeLogId;
    if (lifeLogId !== "" && state.panesLifeLogs.selectedLifeLogNodeId === "") {
      context.setLifeLogCursorInfo({ lifeLogId, cursorPosition: context.lifeLogTextLength });
      context.setEditingField(EditingField.Text);
    }
    context.setIsEditing(true);
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
  async function saveText() {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const selectedLifeLogId = state.panesLifeLogs.selectedLifeLogId;
    if (selectedLifeLogId === "") return;

    const newText = context.pendingText;
    if (newText === undefined) return;

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

  async function saveStartAt() {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const selectedLifeLogId = state.panesLifeLogs.selectedLifeLogId;
    if (selectedLifeLogId === "") return;

    const newTimestamp = context.pendingStartAt;
    if (newTimestamp === undefined) return;

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

  async function saveEndAt() {
    if (state.panesLifeLogs.selectedLifeLogNodeId !== "") return;

    const selectedLifeLogId = state.panesLifeLogs.selectedLifeLogId;
    if (selectedLifeLogId === "") return;

    const newTimestamp = context.pendingEndAt;
    if (newTimestamp === undefined) return;

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

    // Check conditions for deletion: pending text empty, timestamps = none
    if (
      (context.pendingText ?? lifeLog.text) !== "" ||
      !lifeLog.startAt.isEqual(noneTimestamp) ||
      !lifeLog.endAt.isEqual(noneTimestamp)
    ) {
      return;
    }

    // Check for child tree nodes using the flag
    if (lifeLog.hasTreeNodes) {
      return; // Has tree nodes, cannot delete
    }

    // Get previous LifeLog's text length for cursor position
    const prevLifeLog = await getDoc(firestore, lifeLogsCol, context.prevId);
    if (!prevLifeLog) return;

    const cursorPosition = prevLifeLog.text.length;

    // Delete current LifeLog and select previous
    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        batch.delete(doc(lifeLogsCol, selectedLifeLogId));
        deleteNgram(firestore, batch, lifeLogsCol, selectedLifeLogId);
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

    // Check conditions for deletion: pending text empty, timestamps = none
    if (
      (context.pendingText ?? lifeLog.text) !== "" ||
      !lifeLog.startAt.isEqual(noneTimestamp) ||
      !lifeLog.endAt.isEqual(noneTimestamp)
    ) {
      return;
    }

    // Check for child tree nodes using the flag
    if (lifeLog.hasTreeNodes) {
      return; // Has tree nodes, cannot delete
    }

    // Delete current LifeLog and select next with cursor at start
    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        batch.delete(doc(lifeLogsCol, selectedLifeLogId));
        deleteNgram(firestore, batch, lifeLogsCol, selectedLifeLogId);
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

  async function createFirstLifeLog() {
    const newLifeLogId = uuidv7();

    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        setDoc(firestore, batch, lifeLogsCol, {
          id: newLifeLogId,
          text: "",
          hasTreeNodes: false,
          startAt: TimestampNow(),
          endAt: noneTimestamp,
        });
        return Promise.resolve();
      });

      await startTransition(() => {
        updateState((state) => {
          state.panesLifeLogs.selectedLifeLogId = newLifeLogId;
          state.panesLifeLogs.selectedLifeLogNodeId = "";
        });
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  // Tree node actions
  const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");

  async function saveTreeNode() {
    const selectedNodeId = state.panesLifeLogs.selectedLifeLogNodeId;
    if (selectedNodeId === "") return;

    const newText = context.pendingNodeText;
    if (newText === undefined) return;

    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogTreeNodesCol, {
          id: selectedNodeId,
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

  async function splitTreeNode() {
    const selectedNodeId = state.panesLifeLogs.selectedLifeLogNodeId;
    if (selectedNodeId === "") return;

    const text = context.pendingNodeText ?? "";
    const cursorPos = context.nodeCursorPosition;
    const beforeCursor = text.slice(0, cursorPos);
    const afterCursor = text.slice(cursorPos);

    // Save current node with text before cursor
    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogTreeNodesCol, {
          id: selectedNodeId,
          text: beforeCursor,
        });
        return Promise.resolve();
      });
    } finally {
      await startTransition(() => {
        firestore.setClock(false);
      });
    }

    // Create new sibling node with afterCursor
    const node = await getDoc(firestore, lifeLogTreeNodesCol, selectedNodeId);
    if (!node) return;

    const newNodeId = uuidv7();
    context.setEnterSplitNodeId(newNodeId);

    firestore.setClock(true);
    try {
      await runBatch(firestore, async (batch) => {
        await addNextSibling(firestore, batch, lifeLogTreeNodesCol, node, {
          id: newNodeId,
          text: afterCursor,
          lifeLogId: state.panesLifeLogs.selectedLifeLogId,
        });
      });

      // Save setIsEditing reference before updateState triggers onCleanup which resets it
      const setIsEditing = context.setIsEditing;
      await startTransition(() => {
        // IMPORTANT: Call setIsEditing(true) BEFORE updateState
        setIsEditing(true);
        updateState((s) => {
          s.panesLifeLogs.selectedLifeLogNodeId = newNodeId;
        });
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  async function removeOrMergeNodeWithAbove(): Promise<void> {
    const selectedNodeId = state.panesLifeLogs.selectedLifeLogNodeId;
    const lifeLogId = state.panesLifeLogs.selectedLifeLogId;
    if (selectedNodeId === "" || lifeLogId === "") return;

    const node = await getDoc(firestore, lifeLogTreeNodesCol, selectedNodeId);
    if (!node) return;

    // Check if current node has children
    const currentHasChildren = await getFirstChildNode(firestore, lifeLogTreeNodesCol, node);
    if (currentHasChildren) return;

    const currentText = context.pendingNodeText ?? node.text;

    // First, try to remove only empty node (exit to LifeLog)
    if (
      currentText === "" &&
      node.parentId === lifeLogId &&
      !(await getPrevNode(firestore, lifeLogTreeNodesCol, node)) &&
      !(await getNextNode(firestore, lifeLogTreeNodesCol, node))
    ) {
      firestore.setClock(true);
      try {
        await runBatch(firestore, async (batch) => {
          await remove(firestore, batch, lifeLogTreeNodesCol, node);
          // Set hasTreeNodes to false when removing the last node
          updateDoc(firestore, batch, lifeLogsCol, {
            id: lifeLogId,
            hasTreeNodes: false,
          });
        });

        context.setLifeLogCursorInfo({ lifeLogId, cursorPosition: context.lifeLogTextLength });
        const setEditingField = context.setEditingField;
        const setIsEditing = context.setIsEditing;
        await startTransition(() => {
          setEditingField(EditingField.Text);
          setIsEditing(true);
          updateState((s) => {
            s.panesLifeLogs.selectedLifeLogNodeId = "";
          });
          firestore.setClock(false);
        });
      } finally {
        firestore.setClock(false);
      }
      return;
    }

    // Otherwise, try to merge with above node
    const aboveNode = await getAboveNode(firestore, lifeLogTreeNodesCol, node);
    if (!aboveNode) return;

    const mergedText = aboveNode.text + currentText;
    const cursorPosition = aboveNode.text.length;

    firestore.setClock(true);
    try {
      await runBatch(firestore, async (batch) => {
        updateDoc(firestore, batch, lifeLogTreeNodesCol, {
          id: aboveNode.id,
          text: mergedText,
        });
        await remove(firestore, batch, lifeLogTreeNodesCol, node);
      });

      context.setMergeCursorInfo({ nodeId: aboveNode.id, cursorPosition });
      const setIsEditing = context.setIsEditing;
      await startTransition(() => {
        setIsEditing(true);
        updateState((s) => {
          s.panesLifeLogs.selectedLifeLogNodeId = aboveNode.id;
        });
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  async function mergeTreeNodeWithBelow(): Promise<void> {
    const selectedNodeId = state.panesLifeLogs.selectedLifeLogNodeId;
    if (selectedNodeId === "") return;

    const node = await getDoc(firestore, lifeLogTreeNodesCol, selectedNodeId);
    if (!node) return;

    // Get below node
    const belowNode = await getBelowNode(firestore, lifeLogTreeNodesCol, node);
    if (!belowNode) return;

    // Check if below node has children
    const belowHasChildren = await getFirstChildNode(firestore, lifeLogTreeNodesCol, belowNode);
    if (belowHasChildren) return;

    const currentText = context.pendingNodeText ?? node.text;
    const cursorPosition = currentText.length;
    const mergedText = currentText + belowNode.text;

    firestore.setClock(true);
    try {
      await runBatch(firestore, async (batch) => {
        updateDoc(firestore, batch, lifeLogTreeNodesCol, {
          id: node.id,
          text: mergedText,
        });
        await remove(firestore, batch, lifeLogTreeNodesCol, belowNode);
      });

      context.updateNodeInput(mergedText, cursorPosition);

      await startTransition(() => {
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  async function saveAndIndentTreeNode() {
    const cursorPosition = context.nodeCursorPosition;
    const selectedNodeId = state.panesLifeLogs.selectedLifeLogNodeId;
    if (selectedNodeId === "") return;

    await saveTreeNode();
    await actions.components.tree.indentNode();
    context.setTabCursorInfo({ nodeId: selectedNodeId, cursorPosition });
  }

  async function saveAndDedentTreeNode() {
    const cursorPosition = context.nodeCursorPosition;
    const selectedNodeId = state.panesLifeLogs.selectedLifeLogNodeId;
    if (selectedNodeId === "") return;

    await saveTreeNode();
    await actions.components.tree.dedentNode();
    context.setTabCursorInfo({ nodeId: selectedNodeId, cursorPosition });
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
    createFirstLifeLog,
    saveTreeNode,
    splitTreeNode,
    removeOrMergeNodeWithAbove,
    mergeTreeNodeWithBelow,
    saveAndIndentTreeNode,
    saveAndDedentTreeNode,
  };
};
