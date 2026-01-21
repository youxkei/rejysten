import type { Schema } from "@/services/firebase/firestore/schema";

import { type Accessor, type Setter } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { EditableValue } from "@/components/EditableValue";
import { useActionsService } from "@/services/actions";
import { type DocumentData } from "@/services/firebase/firestore";
import { styles } from "@/styles.css";

export function LifeLogTreeNode(props: {
  node$: Accessor<DocumentData<Schema["lifeLogTreeNodes"]>>;
  isSelected$: Accessor<boolean>;
  isEditing: boolean;
  setIsEditing: Setter<boolean>;
  enterSplitNodeId$: Accessor<string | undefined>;
  setEnterSplitNodeId: Setter<string | undefined>;
  tabCursorInfo$: Accessor<{ nodeId: string; cursorPosition: number } | undefined>;
  setTabCursorInfo: Setter<{ nodeId: string; cursorPosition: number } | undefined>;
  mergeCursorInfo$: Accessor<{ nodeId: string; cursorPosition: number } | undefined>;
  setMergeCursorInfo: Setter<{ nodeId: string; cursorPosition: number } | undefined>;
}) {
  const actionsService = useActionsService();
  const actions = actionsService.panes.lifeLogs;

  async function handleKeyDown(event: KeyboardEvent, inputRef: HTMLInputElement, preventBlurSave: () => void) {
    // Handle Tab (save + indent/dedent)
    if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
      event.preventDefault();
      preventBlurSave();

      if (event.shiftKey) {
        await actions.saveAndDedentTreeNode();
      } else {
        await actions.saveAndIndentTreeNode();
      }
      return;
    }

    // Handle Enter (split node)
    if (event.code === "Enter" && !event.isComposing) {
      event.preventDefault();
      preventBlurSave();
      await actions.splitTreeNode();
      return;
    }

    // Handle Backspace at beginning of node
    if (event.code === "Backspace" && inputRef.selectionStart === 0) {
      // IMPORTANT: Call event.preventDefault() and preventBlurSave() BEFORE any async operations
      // because the blur event may fire during the async operation when the input loses focus
      event.preventDefault();
      preventBlurSave();

      // First try to remove only empty tree node (exit to LifeLog)
      const removed = await actions.removeOnlyTreeNode();
      if (removed) {
        return;
      }

      // Try to merge with above node
      await actions.mergeTreeNodeWithAbove();
      return;
    }

    // Handle Delete at end of node - merge with below node
    if (event.code === "Delete" && inputRef.selectionStart === inputRef.value.length) {
      const result = await actions.mergeTreeNodeWithBelow();
      if (result.merged) {
        event.preventDefault();
        preventBlurSave();

        // Update input value directly since we're staying on the same node
        inputRef.value = result.mergedText ?? "";
        // Dispatch input event to update EditableValue's internal state
        inputRef.dispatchEvent(new Event("input", { bubbles: true }));
        inputRef.setSelectionRange(result.cursorPosition ?? 0, result.cursorPosition ?? 0);
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
        actionsService.updateContext((ctx) => {
          ctx.panes.lifeLogs.pendingNodeText = newText;
        });
        await actions.saveTreeNode();
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
      onTextChange={(text) => {
        actionsService.updateContext((ctx) => {
          ctx.panes.lifeLogs.pendingNodeText = text;
        });
      }}
      onSelectionChange={(selectionStart) => {
        actionsService.updateContext((ctx) => {
          ctx.panes.lifeLogs.nodeCursorPosition = selectionStart;
        });
      }}
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
