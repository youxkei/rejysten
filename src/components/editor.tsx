import { onMount } from "solid-js";

import { useEventService } from "@/services/event";
import { useStoreService } from "@/services/store";

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
      ref={input}
      onInput={(event) => emitEvent({ type: "pane", event: { pane: store.currentPane, type: "changeText", newText: event.currentTarget.value } })}
      value={props.text}
    />
  );
}
