import { Show } from "solid-js";

import {
  cycleFieldNext,
  cycleFieldPrev,
  enterTree,
  exitTree,
  goToFirst,
  goToLast,
  navigateNext,
  navigatePrev,
  newLifeLog,
  setEndAtNow,
  setStartAtNow,
  startEditing,
  useActionsContext,
} from "@/panes/lifeLogs/actions";
import { createOnClickHandler } from "@/solid/event";
import { styles } from "@/styles.css";

export function MobileToolbar() {
  const ctx = useActionsContext();

  return (
    <div class={styles.mobileToolbar.container}>
      <Show when={!ctx.isEditing$()} fallback={<EditingToolbar />}>
        <NavigationToolbar />
      </Show>
    </div>
  );
}

function NavigationToolbar() {
  const ctx = useActionsContext();

  // Wrap action calls to preserve SolidJS context
  const handleNavigatePrev = createOnClickHandler(() => {
    navigatePrev();
  });
  const handleNavigateNext = createOnClickHandler(() => {
    navigateNext();
  });
  const handleGoToFirst = createOnClickHandler(() => {
    goToFirst();
  });
  const handleGoToLast = createOnClickHandler(() => {
    goToLast();
  });
  const handleEnterTree = createOnClickHandler(() => enterTree());
  const handleExitTree = createOnClickHandler(() => {
    exitTree();
  });
  const handleNewLifeLog = createOnClickHandler(() => newLifeLog());
  const handleSetStartAtNow = createOnClickHandler(() => setStartAtNow());
  const handleSetEndAtNow = createOnClickHandler(() => setEndAtNow());
  const handleStartEditing = createOnClickHandler(() => {
    startEditing();
  });

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      <button class={styles.mobileToolbar.button} onClick={handleNavigatePrev} disabled={!ctx.hasSelection$()}>
        k
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleNavigateNext} disabled={!ctx.hasSelection$()}>
        j
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleGoToFirst} disabled={!ctx.hasSelection$()}>
        g
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleGoToLast} disabled={!ctx.hasSelection$()}>
        G
      </button>

      <Show when={!ctx.isLifeLogTreeFocused$()}>
        <button class={styles.mobileToolbar.button} onClick={handleEnterTree} disabled={!ctx.isLifeLogSelected$()}>
          l
        </button>
      </Show>
      <Show when={ctx.isLifeLogTreeFocused$()}>
        <button class={styles.mobileToolbar.button} onClick={handleExitTree}>
          h
        </button>
      </Show>

      <button class={styles.mobileToolbar.button} onClick={handleNewLifeLog} disabled={!ctx.hasSelection$()}>
        o
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleSetStartAtNow} disabled={!ctx.isLifeLogSelected$()}>
        s
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleSetEndAtNow} disabled={!ctx.isLifeLogSelected$()}>
        f
      </button>
      <button class={styles.mobileToolbar.button} onClick={handleStartEditing} disabled={!ctx.hasSelection$()}>
        i
      </button>
    </div>
  );
}

function EditingToolbar() {
  const ctx = useActionsContext();

  const handleCycleFieldPrev = createOnClickHandler(() => {
    cycleFieldPrev();
  });
  const handleCycleFieldNext = createOnClickHandler(() => {
    cycleFieldNext();
  });

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      <Show when={!ctx.isLifeLogTreeFocused$()}>
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={handleCycleFieldPrev}>
          S-Tab
        </button>
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={handleCycleFieldNext}>
          Tab
        </button>
      </Show>
    </div>
  );
}
