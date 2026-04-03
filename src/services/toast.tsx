import { Show } from "solid-js";

import { initialState, type StoreService } from "@/services/store";
import { styles } from "@/styles.css";

declare module "@/services/store" {
  interface State {
    toast: {
      message: string;
      type: "success" | "error";
      visible: boolean;
    };
  }
}

initialState.toast = {
  message: "",
  type: "success",
  visible: false,
};

export function showToast(updateState: StoreService["updateState"], message: string, type: "success" | "error") {
  updateState((state) => {
    state.toast.message = message;
    state.toast.type = type;
    state.toast.visible = true;
  });

  setTimeout(() => {
    updateState((state) => {
      state.toast.visible = false;
    });
  }, 3000);
}

export function Toast(props: { state: StoreService["state"] }) {
  return (
    <Show when={props.state.toast.visible}>
      <div class={props.state.toast.type === "success" ? styles.toast.success : styles.toast.error}>
        {props.state.toast.message}
      </div>
    </Show>
  );
}
