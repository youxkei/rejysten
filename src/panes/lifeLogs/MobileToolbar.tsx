import { Show } from "solid-js";

import { awaitable } from "@/awaitableCallback";
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

  // Wrap action calls to preserve SolidJS context
  // Note: In lifeLog mode, "prev" goes up visually (older entries), "next" goes down (newer entries)
  // In tree mode, we map ⬇️ to navigateDown (next in pre-order) and ⬆️ to navigateUp (prev in pre-order)
  const handleNavigatePrev = withOwner(() => {
    if (isTreeFocused()) {
      // ⬇️ button: go DOWN in tree (next node in pre-order traversal)
      awaitable(treeActions.navigateDown)();
    } else {
      actions.navigatePrev();
    }
  });
  const handleNavigateNext = withOwner(() => {
    if (isTreeFocused()) {
      // ⬆️ button: go UP in tree (previous node in pre-order traversal)
      awaitable(treeActions.navigateUp)();
    } else {
      actions.navigateNext();
    }
  });
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
        onClick={handleNavigateNext}
        disabled={state.panesLifeLogs.selectedLifeLogId === ""}
      >
        ⬆️
      </button>
      <button
        class={styles.mobileToolbar.button}
        onClick={handleNavigatePrev}
        disabled={state.panesLifeLogs.selectedLifeLogId === ""}
      >
        ⬇️
      </button>
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
          ➡️
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
        <button class={styles.mobileToolbar.button} onClick={handleIndent}>
          ➡️
        </button>
        <button class={styles.mobileToolbar.button} onClick={handleDedent}>
          ⬅️
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
    context.setIsEditing(false);
  });

  // Tree node editing handlers
  const handleSplitTreeNode = withOwner(() => {
    awaitable(actions.splitTreeNode)();
  });
  const handleRemoveOrMerge = withOwner(() => {
    awaitable(actions.removeOrMergeNodeWithAbove)();
  });
  const handleMergeWithBelow = withOwner(() => {
    awaitable(actions.mergeTreeNodeWithBelow)();
  });

  const handleCycleFieldPrev = withOwner(() => {
    actions.cycleFieldPrev();
  });
  const handleCycleFieldNext = withOwner(() => {
    actions.cycleFieldNext();
  });

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      {/* 編集終了ボタン - 常に表示 */}
      <button class={styles.mobileToolbar.button} data-prevent-blur onClick={handleExitEditing}>
        ✅
      </button>

      <Show when={!isTreeNodeEditing()}>
        {/* lifeLogフィールド切り替え */}
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={handleCycleFieldPrev}>
          ◀️
        </button>
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={handleCycleFieldNext}>
          ▶️
        </button>
      </Show>

      <Show when={isTreeNodeEditing()}>
        {/* Tree node編集ボタン */}
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={handleSplitTreeNode}>
          ⏎
        </button>
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={handleRemoveOrMerge}>
          ⬆️🗑️
        </button>
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={handleMergeWithBelow}>
          ⬇️🗑️
        </button>
      </Show>
    </div>
  );
}
