import { onCleanup, onMount } from "solid-js";

import { useEventService } from "@/services/event";
import { useStoreService } from "@/services/store";
import { styles } from "@/styles.css";

export function Editor(props: { text: string }) {
  const { store } = useStoreService();
  const { emitEvent } = useEventService();

  let input!: HTMLInputElement;

  onMount(() => {
    input.focus();

    if (store.editor.initialPosition === -1) {
      const pos = props.text.length;
      input.setSelectionRange(pos, pos);
    } else {
      const pos = store.editor.initialPosition;
      input.setSelectionRange(pos, pos);
    }
  });

  let active = true;
  onCleanup(() => {
    active = false;
  });

  const onBlur = () => {
    if (active) {
      emitEvent({ pane: store.currentPane, mode: "insert", type: "leaveInsertMode" });
    }
  };

  return (
    <input
      class={styles.editor}
      ref={input}
      onInput={(event) => emitEvent({ pane: store.currentPane, mode: "insert", type: "changeEditorText", newText: event.currentTarget.value })}
      onBlur={onBlur}
      value={props.text}
    />
  );
}
