import type { Schema } from "@/services/firebase/firestore/schema";

import { type Accessor, type Setter, startTransition } from "solid-js";
import { uuidv7 } from "uuidv7";

import { awaitable } from "@/awaitableCallback";
import { EditableValue } from "@/components/EditableValue";
import { EditingField } from "@/panes/lifeLogs/schema";
import { useActionsService } from "@/services/actions";
import { type DocumentData, getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { getDoc } from "@/services/firebase/firestore";
import { runBatch, updateDoc } from "@/services/firebase/firestore/batch";
import {
  addNextSibling,
  getAboveNode,
  getBelowNode,
  getFirstChildNode,
  getNextNode,
  getPrevNode,
  remove,
} from "@/services/firebase/firestore/treeNode";
import { styles } from "@/styles.css";

export function LifeLogTreeNode(props: {
  lifeLogId: string;
  node$: Accessor<DocumentData<Schema["lifeLogTreeNodes"]>>;
  isSelected$: Accessor<boolean>;
  isEditing: boolean;
  setIsEditing: Setter<boolean>;
  setEditingField: (field: EditingField) => void;
  selectedLifeLogNodeId$: Accessor<string>;
  setSelectedLifeLogNodeId: (id: string) => void;
  enterSplitNodeId$: Accessor<string | undefined>;
  setEnterSplitNodeId: Setter<string | undefined>;
  tabCursorInfo$: Accessor<{ nodeId: string; cursorPosition: number } | undefined>;
  setTabCursorInfo: Setter<{ nodeId: string; cursorPosition: number } | undefined>;
  mergeCursorInfo$: Accessor<{ nodeId: string; cursorPosition: number } | undefined>;
  setMergeCursorInfo: Setter<{ nodeId: string; cursorPosition: number } | undefined>;
  lifeLogText: string;
  setLifeLogCursorInfo: (info: { lifeLogId: string; cursorPosition: number } | undefined) => void;
}) {
  const firestore = useFirestoreService();
  const actionsService = useActionsService();
  const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");

  async function onSaveNode(newText: string) {
    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, getCollection(firestore, "lifeLogTreeNodes"), {
          id: props.node$().id,
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

  async function handleKeyDown(event: KeyboardEvent, inputRef: HTMLInputElement, preventBlurSave: () => void) {
    // Handle Tab (save + indent/dedent via tree.tsx)
    if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
      event.preventDefault();
      preventBlurSave();

      const cursorPosition = inputRef.selectionStart ?? 0;
      await onSaveNode(inputRef.value);
      if (event.shiftKey) {
        await actionsService.components.tree.dedentNode();
      } else {
        await actionsService.components.tree.indentNode();
      }
      props.setTabCursorInfo({ nodeId: props.node$().id, cursorPosition });
      return;
    }

    // Handle Enter (LifeLogTree-specific: split node)
    if (event.code === "Enter" && !event.isComposing) {
      event.preventDefault();
      preventBlurSave();

      const text = inputRef.value;
      const cursorPos = inputRef.selectionStart ?? text.length;
      const beforeCursor = text.slice(0, cursorPos);
      const afterCursor = text.slice(cursorPos);

      await onSaveNode(beforeCursor);

      // Create new sibling node with afterCursor
      const node = await getDoc(firestore, lifeLogTreeNodesCol, props.node$().id);
      if (!node) return;

      const newNodeId = uuidv7();
      props.setEnterSplitNodeId(newNodeId);

      try {
        firestore.setClock(true);
        await runBatch(firestore, async (batch) => {
          await addNextSibling(firestore, batch, lifeLogTreeNodesCol, node, {
            id: newNodeId,
            text: afterCursor,
          });
        });

        await startTransition(() => {
          props.setSelectedLifeLogNodeId(newNodeId);
          props.setIsEditing(true);
          firestore.setClock(false);
        });
      } finally {
        firestore.setClock(false);
      }
    }

    // Handle Backspace at beginning of node - merge with previous node
    if (event.code === "Backspace" && inputRef.selectionStart === 0) {
      const node = await getDoc(firestore, lifeLogTreeNodesCol, props.node$().id);
      if (!node) return;

      // Check if current node has children (we're deleting current node)
      const currentHasChildren = await getFirstChildNode(firestore, lifeLogTreeNodesCol, node);
      if (currentHasChildren) return; // Allow normal backspace

      // Check if this is the only empty node directly under the LifeLog
      if (
        inputRef.value === "" &&
        node.parentId === props.lifeLogId &&
        !(await getPrevNode(firestore, lifeLogTreeNodesCol, node)) &&
        !(await getNextNode(firestore, lifeLogTreeNodesCol, node))
      ) {
        event.preventDefault();
        preventBlurSave();

        firestore.setClock(true);
        try {
          await runBatch(firestore, async (batch) => {
            await remove(firestore, batch, lifeLogTreeNodesCol, node);
          });

          props.setLifeLogCursorInfo({ lifeLogId: props.lifeLogId, cursorPosition: props.lifeLogText.length });
          await startTransition(() => {
            props.setSelectedLifeLogNodeId("");
            props.setEditingField(EditingField.Text);
            props.setIsEditing(true);
            firestore.setClock(false);
          });
        } finally {
          firestore.setClock(false);
        }
        return;
      }

      // Get previous node
      const aboveNode = await getAboveNode(firestore, lifeLogTreeNodesCol, node);
      if (!aboveNode) return; // No previous node

      // Note: Previous node may have children (e.g., parent node), but that's OK
      // because we're only deleting the current node, not the previous one

      event.preventDefault();
      preventBlurSave();

      const mergedText = aboveNode.text + inputRef.value;
      const cursorPosition = aboveNode.text.length;

      firestore.setClock(true);
      try {
        await runBatch(firestore, async (batch) => {
          // Update previous node with merged text
          updateDoc(firestore, batch, lifeLogTreeNodesCol, {
            id: aboveNode.id,
            text: mergedText,
          });
          // Delete current node
          await remove(firestore, batch, lifeLogTreeNodesCol, node);
        });

        props.setMergeCursorInfo({ nodeId: aboveNode.id, cursorPosition });
        await startTransition(() => {
          props.setSelectedLifeLogNodeId(aboveNode.id);
          props.setIsEditing(true);
          firestore.setClock(false);
        });
      } finally {
        firestore.setClock(false);
      }
      return;
    }

    // Handle Delete at end of node - merge with next node
    if (event.code === "Delete" && inputRef.selectionStart === inputRef.value.length) {
      const node = await getDoc(firestore, lifeLogTreeNodesCol, props.node$().id);
      if (!node) return;

      // Get next node
      const belowNode = await getBelowNode(firestore, lifeLogTreeNodesCol, node);
      if (!belowNode) return;

      // Check if next node has children (we're deleting next node)
      const nextHasChildren = await getFirstChildNode(firestore, lifeLogTreeNodesCol, belowNode);
      if (nextHasChildren) return;

      event.preventDefault();
      preventBlurSave();

      const cursorPosition = inputRef.value.length;
      const mergedText = inputRef.value + belowNode.text;

      firestore.setClock(true);
      try {
        await runBatch(firestore, async (batch) => {
          // Update current node with merged text
          updateDoc(firestore, batch, lifeLogTreeNodesCol, {
            id: node.id,
            text: mergedText,
          });
          // Delete next node
          await remove(firestore, batch, lifeLogTreeNodesCol, belowNode);
        });

        // Update input value directly since we're staying on the same node
        inputRef.value = mergedText;
        // Dispatch input event to update EditableValue's internal state
        inputRef.dispatchEvent(new Event("input", { bubbles: true }));
        inputRef.setSelectionRange(cursorPosition, cursorPosition);

        await startTransition(() => {
          firestore.setClock(false);
        });
      } finally {
        firestore.setClock(false);
      }
      return;
    }
  }

  return (
    <EditableValue
      debugId={`treeNode-${props.node$().text}`}
      value={props.node$().text}
      toText={(text) => text}
      fromText={(text) => text}
      onSave={async (newText) => {
        await onSaveNode(newText);
      }}
      isSelected={props.isSelected$()}
      isEditing={props.isEditing}
      setIsEditing={(editing) => {
        props.setIsEditing(editing);
        if (!editing) {
          props.setEnterSplitNodeId(undefined);
          props.setTabCursorInfo(undefined);
          props.setMergeCursorInfo(undefined);
        }
      }}
      className={styles.lifeLogTree.text}
      selectedClassName={styles.lifeLogTree.selected}
      editInputClassName={styles.lifeLogTree.editInput}
      onKeyDown={awaitable(handleKeyDown)}
      initialCursorPosition={
        props.enterSplitNodeId$() === props.node$().id
          ? 0
          : props.tabCursorInfo$()?.nodeId === props.node$().id
            ? props.tabCursorInfo$()?.cursorPosition
            : props.mergeCursorInfo$()?.nodeId === props.node$().id
              ? props.mergeCursorInfo$()?.cursorPosition
              : undefined
      }
    />
  );
}
