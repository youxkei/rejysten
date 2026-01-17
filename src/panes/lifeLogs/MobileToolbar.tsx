import { Show } from "solid-js";

import { useActions } from "@/panes/lifeLogs/actions";
import { withOwner } from "@/solid/owner";
import { styles } from "@/styles.css";

export function MobileToolbar() {
  const actions = useActions();

  return (
    <div class={styles.mobileToolbar.container}>
      <Show when={!actions.context.isEditing} fallback={<EditingToolbar />}>
        <NavigationToolbar />
      </Show>
    </div>
  );
}

function NavigationToolbar() {
  const actions = useActions();

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
      <button class={styles.mobileToolbar.button} onClick={handleNavigatePrev} disabled={!actions.context.hasSelection}>
        ⬇️
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleNavigateNext} disabled={!actions.context.hasSelection}>
        ⬆️
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleGoToFirst} disabled={!actions.context.hasSelection}>
        ⏬
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleGoToLast} disabled={!actions.context.hasSelection}>
        ⏫
      </button>

      <Show when={!actions.context.isLifeLogTreeFocused}>
        <button
          class={styles.mobileToolbar.button}
          onClick={handleEnterTree}
          disabled={!actions.context.isLifeLogSelected}
        >
          ➡️
        </button>
      </Show>
      <Show when={actions.context.isLifeLogTreeFocused}>
        <button class={styles.mobileToolbar.button} onClick={handleExitTree}>
          ⬅️
        </button>
      </Show>

      <button class={styles.mobileToolbar.button} onClick={handleNewLifeLog} disabled={!actions.context.hasSelection}>
        ➕
      </button>
      <button
        class={styles.mobileToolbar.button}
        onClick={handleSetStartAtNow}
        disabled={!actions.context.isLifeLogSelected}
      >
        ▶️
      </button>
      <button
        class={styles.mobileToolbar.button}
        onClick={handleSetEndAtNow}
        disabled={!actions.context.isLifeLogSelected}
      >
        ⏹️
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleStartEditing} disabled={!actions.context.hasSelection}>
        ✏️
      </button>
    </div>
  );
}

function EditingToolbar() {
  const actions = useActions();

  const handleCycleFieldPrev = withOwner(() => {
    actions.cycleFieldPrev();
  });
  const handleCycleFieldNext = withOwner(() => {
    actions.cycleFieldNext();
  });

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      <Show when={!actions.context.isLifeLogTreeFocused}>
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
