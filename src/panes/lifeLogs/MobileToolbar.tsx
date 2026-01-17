import { Show } from "solid-js";

import { useActionsContext } from "@/panes/lifeLogs/actionsContext";
import { styles } from "@/styles.css";

export function MobileToolbar() {
  const ctx = useActionsContext();

  return (
    <div class={styles.mobileToolbar.container}>
      <Show when={!ctx.state.isEditing} fallback={<EditingToolbar />}>
        <NavigationToolbar />
      </Show>
    </div>
  );
}

function NavigationToolbar() {
  const ctx = useActionsContext();

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      <button
        class={styles.mobileToolbar.button}
        onClick={() => ctx.actions?.navigatePrev()}
        disabled={!ctx.state.hasSelection}
      >
        k
      </button>
      <button
        class={styles.mobileToolbar.button}
        onClick={() => ctx.actions?.navigateNext()}
        disabled={!ctx.state.hasSelection}
      >
        j
      </button>
      <button
        class={styles.mobileToolbar.button}
        onClick={() => ctx.actions?.goToFirst()}
        disabled={!ctx.state.hasSelection}
      >
        g
      </button>
      <button
        class={styles.mobileToolbar.button}
        onClick={() => ctx.actions?.goToLast()}
        disabled={!ctx.state.hasSelection}
      >
        G
      </button>

      <Show when={!ctx.state.isLifeLogTreeFocused}>
        <button
          class={styles.mobileToolbar.button}
          onClick={() => ctx.actions?.enterTree()}
          disabled={!ctx.state.isLifeLogSelected}
        >
          l
        </button>
      </Show>
      <Show when={ctx.state.isLifeLogTreeFocused}>
        <button class={styles.mobileToolbar.button} onClick={() => ctx.actions?.exitTree()}>
          h
        </button>
      </Show>

      <button
        class={styles.mobileToolbar.button}
        onClick={() => ctx.actions?.newLifeLog()}
        disabled={!ctx.state.hasSelection}
      >
        o
      </button>
      <button
        class={styles.mobileToolbar.button}
        onClick={() => ctx.actions?.setStartAtNow()}
        disabled={!ctx.state.isLifeLogSelected}
      >
        s
      </button>
      <button
        class={styles.mobileToolbar.button}
        onClick={() => ctx.actions?.setEndAtNow()}
        disabled={!ctx.state.isLifeLogSelected}
      >
        f
      </button>
      <button
        class={styles.mobileToolbar.button}
        onClick={() => ctx.actions?.startEditing()}
        disabled={!ctx.state.hasSelection}
      >
        i
      </button>
    </div>
  );
}

function EditingToolbar() {
  const ctx = useActionsContext();

  return (
    <div class={styles.mobileToolbar.buttonGroup}>
      <Show when={!ctx.state.isLifeLogTreeFocused}>
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={() => ctx.actions?.cycleFieldPrev()}>
          S-Tab
        </button>
        <button class={styles.mobileToolbar.button} data-prevent-blur onClick={() => ctx.actions?.cycleFieldNext()}>
          Tab
        </button>
      </Show>
    </div>
  );
}
