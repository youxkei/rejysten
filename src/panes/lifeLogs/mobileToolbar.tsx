import { Show } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { EditingField } from "@/panes/lifeLogs/schema";
import { useActionsService } from "@/services/actions";
import { useStoreService } from "@/services/store";
import { withOwner } from "@/solid/owner";
import { styles } from "@/styles.css";

export function MobileToolbar() {
  const {
    context: {
      panes: { lifeLogs: context },
    },
  } = useActionsService();

  return (
    <div class={styles.mobileToolbar.container}>
      <Show when={!context.isEditing} fallback={<EditingToolbar />}>
        <NavigationToolbar />
      </Show>
    </div>
  );
}

function NavigationToolbar() {
  const {
    panes: { lifeLogs: actions },
    components: { tree: treeActions },
  } = useActionsService();
  const { state } = useStoreService();

  const isTreeFocused = () => state.panesLifeLogs.selectedLifeLogNodeId !== "";

  const handleGoToFirst = withOwner(() => {
    if (isTreeFocused()) {
      // ⏬ button: go to LAST node in tree (bottom of visual tree)
      awaitable(treeActions.goToLast)();
    } else {
      actions.goToFirst();
    }
  });
  const handleGoToLast = withOwner(() => {
    if (isTreeFocused()) {
      // ⏫ button: go to FIRST node in tree (top of visual tree)
      awaitable(treeActions.goToFirst)();
    } else {
      actions.goToLast();
    }
  });
  const handleEnterTree = withOwner(() => actions.enterTree());
  const handleExitTree = withOwner(() => {
    actions.exitTree();
  });
  const handleNewLifeLog = withOwner(() => actions.newLifeLog());
  const handleSetStartAtNow = withOwner(() => actions.setStartAtNow());
  const handleSetEndAtNow = withOwner(() => actions.setEndAtNow());
  const handleStartEditing = withOwner(() => {
    actions.startEditing();
  });
  const handleAddNodeAbove = withOwner(() => {
    awaitable(actions.addSiblingNode)(true);
  });
  const handleAddNodeBelow = withOwner(() => {
    awaitable(actions.addSiblingNode)(false);
  });
  const handleIndent = withOwner(() => {
    awaitable(treeActions.indentNode)();
  });
  const handleDedent = withOwner(() => {
    awaitable(treeActions.dedentNode)();
  });

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      <button
        class={styles.mobileToolbar.button}
        onClick={handleGoToLast}
        disabled={state.panesLifeLogs.selectedLifeLogId === ""}
      >
        ⏫
      </button>
      <button
        class={styles.mobileToolbar.button}
        onClick={handleGoToFirst}
        disabled={state.panesLifeLogs.selectedLifeLogId === ""}
      >
        ⏬
      </button>

      <Show when={state.panesLifeLogs.selectedLifeLogNodeId === ""}>
        <button
          class={styles.mobileToolbar.button}
          onClick={handleEnterTree}
          disabled={state.panesLifeLogs.selectedLifeLogId === "" || state.panesLifeLogs.selectedLifeLogNodeId !== ""}
        >
          ↪️
        </button>
      </Show>
      <Show when={state.panesLifeLogs.selectedLifeLogNodeId !== ""}>
        <button class={styles.mobileToolbar.button} onClick={handleExitTree}>
          ↩️
        </button>
      </Show>

      <Show when={!isTreeFocused()}>
        <button
          class={styles.mobileToolbar.button}
          onClick={handleNewLifeLog}
          disabled={state.panesLifeLogs.selectedLifeLogId === ""}
        >
          ➕
        </button>
        <button
          class={styles.mobileToolbar.button}
          onClick={handleSetStartAtNow}
          disabled={state.panesLifeLogs.selectedLifeLogId === "" || state.panesLifeLogs.selectedLifeLogNodeId !== ""}
        >
          ▶️
        </button>
        <button
          class={styles.mobileToolbar.button}
          onClick={handleSetEndAtNow}
          disabled={state.panesLifeLogs.selectedLifeLogId === "" || state.panesLifeLogs.selectedLifeLogNodeId !== ""}
        >
          ⏹️
        </button>
      </Show>
      <Show when={isTreeFocused()}>
        <button class={styles.mobileToolbar.button} onClick={handleAddNodeAbove}>
          ⬆️➕
        </button>
        <button class={styles.mobileToolbar.button} onClick={handleAddNodeBelow}>
          ⬇️➕
        </button>
        <button class={styles.mobileToolbar.button} onClick={handleDedent}>
          ⬅️
        </button>
        <button class={styles.mobileToolbar.button} onClick={handleIndent}>
          ➡️
        </button>
      </Show>
      <button
        class={styles.mobileToolbar.button}
        onClick={handleStartEditing}
        disabled={state.panesLifeLogs.selectedLifeLogId === ""}
      >
        ✏️
      </button>
    </div>
  );
}

function EditingToolbar() {
  const {
    panes: { lifeLogs: actions },
    context: {
      panes: { lifeLogs: context },
    },
  } = useActionsService();
  const { state } = useStoreService();

  const isTreeNodeEditing = () => state.panesLifeLogs.selectedLifeLogNodeId !== "";

  // 編集終了ハンドラ
  const handleExitEditing = withOwner(() => {
    awaitable(async () => {
      if (state.panesLifeLogs.selectedLifeLogNodeId !== "") {
        // Tree node editing
        await actions.saveTreeNode();
      } else {
        // LifeLog editing - save based on current editing field
        switch (context.editingField) {
          case EditingField.Text:
            await actions.saveText();
            break;
          case EditingField.StartAt:
            await actions.saveStartAt();
            break;
          case EditingField.EndAt:
            await actions.saveEndAt();
            break;
        }
      }
      context.setIsEditing(false);
    })();
  });

  // Prevent blur by stopping mousedown default behavior
  const preventBlur = (e: MouseEvent) => {
    e.preventDefault();
  };

  // Tree node editing handlers
  const handleSplitTreeNode = withOwner(() => {
    context.preventBlurSave();
    awaitable(actions.splitTreeNode)();
  });
  const handleRemoveOrMerge = withOwner(() => {
    // Only allow removal/merge when cursor is at beginning (like Backspace)
    if (context.nodeCursorPosition !== 0) return;
    context.preventBlurSave();
    awaitable(actions.removeOrMergeNodeWithAbove)();
  });
  const handleMergeWithBelow = withOwner(() => {
    // Only allow merge when cursor is at end (like Delete key)
    if (context.nodeCursorPosition !== (context.pendingNodeText?.length ?? 0)) return;
    context.preventBlurSave();
    awaitable(actions.mergeTreeNodeWithBelow)();
  });

  const handleCycleFieldPrev = withOwner(() => {
    context.preventBlurSave();
    actions.cycleFieldPrev();
  });
  const handleCycleFieldNext = withOwner(() => {
    context.preventBlurSave();
    actions.cycleFieldNext();
  });

  const handleIndent = withOwner(() => {
    context.preventBlurSave();
    awaitable(actions.saveAndIndentTreeNode)();
  });
  const handleDedent = withOwner(() => {
    context.preventBlurSave();
    awaitable(actions.saveAndDedentTreeNode)();
  });

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      <Show when={!isTreeNodeEditing()}>
        {/* lifeLogフィールド切り替え */}
        <button class={styles.mobileToolbar.button} onMouseDown={preventBlur} onClick={handleCycleFieldPrev}>
          ◀️
        </button>
        <button class={styles.mobileToolbar.button} onMouseDown={preventBlur} onClick={handleCycleFieldNext}>
          ▶️
        </button>
      </Show>

      <Show when={isTreeNodeEditing()}>
        {/* Tree node編集ボタン */}
        <button class={styles.mobileToolbar.button} onMouseDown={preventBlur} onClick={handleSplitTreeNode}>
          ⏎
        </button>
        <button class={styles.mobileToolbar.button} onMouseDown={preventBlur} onClick={handleRemoveOrMerge}>
          ⬆️🗑️
        </button>
        <button class={styles.mobileToolbar.button} onMouseDown={preventBlur} onClick={handleMergeWithBelow}>
          ⬇️🗑️
        </button>
        <button class={styles.mobileToolbar.button} onMouseDown={preventBlur} onClick={handleDedent}>
          ⬅️
        </button>
        <button class={styles.mobileToolbar.button} onMouseDown={preventBlur} onClick={handleIndent}>
          ➡️
        </button>
      </Show>

      {/* 編集終了ボタン - 右端に配置 */}
      <button class={styles.mobileToolbar.button} onMouseDown={preventBlur} onClick={handleExitEditing}>
        ✅
      </button>
    </div>
  );
}
