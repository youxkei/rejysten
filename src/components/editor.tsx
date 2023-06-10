import { createEffect, onCleanup } from "solid-js";

import { useEventService } from "@/services/event";
import { createSignalWithLock, useLockService } from "@/services/lock";
import { useStoreService } from "@/services/store";
import { styles } from "@/styles.css";

export function Editor(props: { text: string }) {
  const lock = useLockService();
  const { store } = useStoreService();
  const { emitEvent } = useEventService();

  const cursorPosition$ = createSignalWithLock(lock, () => store.editor.cursorPosition, -1, true);

  let input!: HTMLInputElement;

  createEffect(() => {
    input.focus();
    const pos = cursorPosition$();

    if (pos === -1) {
      const len = props.text.length;
      input.setSelectionRange(len, len);
    } else {
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
