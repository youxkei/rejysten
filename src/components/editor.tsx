import { debounce } from "@solid-primitives/scheduled";
import { createEffect, onCleanup, untrack } from "solid-js";

import { useEventService } from "@/services/event";
import { createSignalWithLock, useLockService } from "@/services/lock";
import { useStoreService } from "@/services/store";
import { styles } from "@/styles.css";

export function Editor() {
  let input!: HTMLInputElement;

  const lock = useLockService();
  const { state, updateState } = useStoreService();
  const { emitEvent } = useEventService();

  const text$ = createSignalWithLock(lock, () => state.editor.text, "", true);
  const cursorPosition$ = createSignalWithLock(lock, () => state.editor.cursorPosition, -1, true);

  createEffect(() => {
    input.focus();

    const pos = cursorPosition$();

    if (pos === -1) {
      const len = untrack(text$).length;
      input.setSelectionRange(len, len);
    } else {
      input.setSelectionRange(pos, pos);
    }
  });

  const emitChangeEditorText = debounce(() => {
    emitEvent({
      pane: state.currentPane,
      mode: "insert",
      type: "changeEditorText",
    });
  }, 500);

  let active = true;
  onCleanup(() => {
    active = false;
  });

  const onBlur = () => {
    if (active) {
      emitEvent({
        pane: state.currentPane,
        mode: "insert",
        type: "leaveInsertMode",
      });
    }
  };

  return (
    <input
      class={styles.editor}
      ref={input}
      onInput={(event) => {
        const newText = event.target.value;

        updateState((state) => {
          state.editor.text = newText;
        });

        emitChangeEditorText();
      }}
      onBlur={onBlur}
      value={text$()}
    />
  );
}
