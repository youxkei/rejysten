import { onMount } from "solid-js";

import { useEventService } from "@/services/event";
import { useStoreService } from "@/services/store";
import { styles } from "@/styles.css";

export function Editor(props: { text: string }) {
  const { store } = useStoreService();
  const { emitEvent } = useEventService();

  let input!: HTMLInputElement;

  onMount(() => {
    input.focus();

    switch (store.editor.initialPosition) {
      case "start": {
        input.setSelectionRange(0, 0);

        break;
      }

      case "end": {
        const length = props.text.length;
        input.setSelectionRange(length, length);

        break;
      }
    }
  });

  return (
    <input
      class={styles.editor}
      ref={input}
      onInput={(event) => emitEvent({ kind: "pane", pane: store.currentPane, mode: "insert", type: "changeEditorText", newText: event.currentTarget.value })}
      onBlur={() => emitEvent({ kind: "pane", pane: store.currentPane, mode: "insert", type: "leaveInsertMode" })}
      value={props.text}
    />
  );
}
