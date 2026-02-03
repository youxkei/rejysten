import type { Schema } from "@/services/firebase/firestore/schema";

import { type Accessor, type Setter } from "solid-js";

import { EditableValue } from "@/components/editableValue";
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

  function handleKeyDown(event: KeyboardEvent, inputRef: HTMLInputElement, preventBlurSave: () => void) {
    // Handle Tab (save + indent/dedent)
    if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
      event.preventDefault();
      preventBlurSave();

      if (event.shiftKey) {
        actions.saveAndDedentTreeNode();
      } else {
        actions.saveAndIndentTreeNode();
      }
      return;
    }

    // Handle Enter (split node)
    if (event.code === "Enter" && !event.isComposing) {
      event.preventDefault();
      preventBlurSave();
      actions.splitTreeNode();
      return;
    }

    // Handle Backspace at beginning of node
    if (event.code === "Backspace" && inputRef.selectionStart === 0 && inputRef.selectionStart === inputRef.selectionEnd) {
      event.preventDefault();
      preventBlurSave();
      actions.removeOrMergeNodeWithAbove();
      return;
    }

    // Handle Delete at end of node - merge with below node
    if (event.code === "Delete" && inputRef.selectionStart === inputRef.value.length && inputRef.selectionStart === inputRef.selectionEnd) {
      event.preventDefault();
      preventBlurSave();
      actions.mergeTreeNodeWithBelow();
      return;
    }
  }

  return (
    <EditableValue
      debugId={`treeNode-${props.node$().text}`}
      value={props.node$().text}
      toText={(text) => text}
      fromText={(text) => text}
      onSave={(_, stopEditing) => {
        actions.saveTreeNode(stopEditing);
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
      onKeyDown={handleKeyDown}
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
      onInputRef={(inputRef) => {
        actionsService.updateContext((ctx) => {
          ctx.panes.lifeLogs.updateNodeInput = (text, cursorPosition) => {
            inputRef.value = text;
            inputRef.dispatchEvent(new Event("input", { bubbles: true }));
            inputRef.setSelectionRange(cursorPosition, cursorPosition);
          };
        });
      }}
      onPreventBlurSave={(fn) => {
        actionsService.updateContext((ctx) => {
          ctx.panes.lifeLogs.preventBlurSave = fn;
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
