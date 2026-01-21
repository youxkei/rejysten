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
      event.preventDefault();
      preventBlurSave();
      await actions.removeOrMergeNodeWithAbove();
      return;
    }

    // Handle Delete at end of node - merge with below node
    if (event.code === "Delete" && inputRef.selectionStart === inputRef.value.length) {
      event.preventDefault();
      preventBlurSave();
      await actions.mergeTreeNodeWithBelow();
      return;
    }
  }

  return (
    <EditableValue
      debugId={`treeNode-${props.node$().text}`}
      value={props.node$().text}
      toText={(text) => text}
      fromText={(text) => text}
      onSave={async () => {
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
      onInputRef={(inputRef) => {
        actionsService.updateContext((ctx) => {
          ctx.panes.lifeLogs.updateNodeInput = (text, cursorPosition) => {
            inputRef.value = text;
            inputRef.dispatchEvent(new Event("input", { bubbles: true }));
            inputRef.setSelectionRange(cursorPosition, cursorPosition);
          };
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
