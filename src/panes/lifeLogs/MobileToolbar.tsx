import { Show } from "solid-js";

import { useActionsService } from "@/services/actions";
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
    context: {
      panes: { lifeLogs: context },
    },
    panes: { lifeLogs: actions },
  } = useActionsService();

  // Wrap action calls to preserve SolidJS context
  const handleNavigatePrev = withOwner(() => {
    actions.navigatePrev();
  });
  const handleNavigateNext = withOwner(() => {
    actions.navigateNext();
  });
  const handleGoToFirst = withOwner(() => {
    actions.goToFirst();
  });
  const handleGoToLast = withOwner(() => {
    actions.goToLast();
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

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      <button class={styles.mobileToolbar.button} onClick={handleNavigateNext} disabled={!context.hasSelection}>
        ⬆️
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleNavigatePrev} disabled={!context.hasSelection}>
        ⬇️
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleGoToLast} disabled={!context.hasSelection}>
        ⏫
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleGoToFirst} disabled={!context.hasSelection}>
        ⏬
      </button>

      <Show when={!context.isLifeLogTreeFocused}>
        <button class={styles.mobileToolbar.button} onClick={handleEnterTree} disabled={!context.isLifeLogSelected}>
          ➡️
        </button>
      </Show>
      <Show when={context.isLifeLogTreeFocused}>
        <button class={styles.mobileToolbar.button} onClick={handleExitTree}>
          ⬅️
        </button>
      </Show>

      <button class={styles.mobileToolbar.button} onClick={handleNewLifeLog} disabled={!context.hasSelection}>
        ➕
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleSetStartAtNow} disabled={!context.isLifeLogSelected}>
        ▶️
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleSetEndAtNow} disabled={!context.isLifeLogSelected}>
        ⏹️
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleStartEditing} disabled={!context.hasSelection}>
        ✏️
      </button>
    </div>
  );
}

function EditingToolbar() {
  const {
    context: {
      panes: { lifeLogs: context },
    },
    panes: { lifeLogs: actions },
  } = useActionsService();

  const handleCycleFieldPrev = withOwner(() => {
    actions.cycleFieldPrev();
  });
  const handleCycleFieldNext = withOwner(() => {
    actions.cycleFieldNext();
  });

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      <Show when={!context.isLifeLogTreeFocused}>
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={handleCycleFieldPrev}>
          ◀️
        </button>
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={handleCycleFieldNext}>
          ▶️
        </button>
      </Show>
    </div>
  );
}
