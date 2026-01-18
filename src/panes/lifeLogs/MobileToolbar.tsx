import { Show } from "solid-js";

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
  } = useActionsService();
  const { state } = useStoreService();

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
          ⬅️
        </button>
      </Show>

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
  } = useActionsService();
  const { state } = useStoreService();

  const handleCycleFieldPrev = withOwner(() => {
    actions.cycleFieldPrev();
  });
  const handleCycleFieldNext = withOwner(() => {
    actions.cycleFieldNext();
  });

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      <Show when={state.panesLifeLogs.selectedLifeLogNodeId === ""}>
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
