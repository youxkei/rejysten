import { Show, onMount } from "solid-js";

import { initialState, useStoreService, type StoreService } from "@/services/store";
import { styles } from "@/styles.css";

declare module "@/services/store" {
  interface State {
    toast: {
      message: string;
      type: "success" | "error";
      phase: "hidden" | "visible" | "hiding";
    };
  }
}

initialState.toast = {
  message: "",
  type: "success",
  phase: "hidden",
};

let hideTimeoutId: ReturnType<typeof setTimeout> | undefined;

export function showToast(updateState: StoreService["updateState"], message: string, type: "success" | "error") {
  if (hideTimeoutId !== undefined) {
    clearTimeout(hideTimeoutId);
  }

  updateState((state) => {
    state.toast.message = message;
    state.toast.type = type;
    state.toast.phase = "visible";
  });

  hideTimeoutId = setTimeout(() => {
    hideTimeoutId = undefined;
    updateState((state) => {
      state.toast.phase = "hiding";
    });
  }, 3000);
}

function dismissToast(updateState: StoreService["updateState"]) {
  if (hideTimeoutId !== undefined) {
    clearTimeout(hideTimeoutId);
    hideTimeoutId = undefined;
  }
  updateState((state) => {
    state.toast.phase = "hiding";
  });
}

export function Toast() {
  const { state, updateState } = useStoreService();

  onMount(() => {
    if (state.toast.phase !== "hidden") {
      updateState((s) => {
        s.toast.phase = "hidden";
      });
    }
  });

  function handleAnimationEnd() {
    if (state.toast.phase === "hiding") {
      updateState((s) => {
        s.toast.phase = "hidden";
      });
    }
  }

  function handleClick() {
    dismissToast(updateState);
  }

  return (
    <Show when={state.toast.phase !== "hidden"}>
      <div
        class={
          state.toast.type === "success"
            ? state.toast.phase === "hiding"
              ? styles.toast.successHiding
              : styles.toast.success
            : state.toast.phase === "hiding"
              ? styles.toast.errorHiding
              : styles.toast.error
        }
        onClick={handleClick}
        onAnimationEnd={handleAnimationEnd}
      >
        {state.toast.message}
      </div>
    </Show>
  );
}
