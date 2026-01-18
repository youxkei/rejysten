import { debounce } from "@solid-primitives/scheduled";
import { createEffect, createSignal, on, Show, type JSX, onMount } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { addKeyDownEventListener } from "@/solid/event";

export interface EditableValueProps<V> {
  value: V;
  onSave: (newValue: V) => Promise<void>;
  isSelected: boolean;
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
  // Converter functions
  toText: (value: V) => string;
  fromText: (text: string) => V | undefined;
  // Optional converter for edit mode (defaults to toText if not provided)
  toEditText?: (value: V) => string;
  // Display component when not editing
  displayComponent?: (value: V) => JSX.Element;
  className?: string;
  selectedClassName?: string;
  editInputClassName?: string;
  debounceMs?: number;
  // Key down callback - receives event, input ref, and function to prevent blur save
  onKeyDown?: (event: KeyboardEvent, inputRef: HTMLInputElement, preventBlurSave: () => void) => void;
  // Initial cursor position when entering edit mode
  initialCursorPosition?: number;
  debugId?: string;
}

export function EditableValue<V>(props: EditableValueProps<V>) {
  const [editText, setEditText] = createSignal("");
  const [blurSavePrevented, setBlurSavePrevented] = createSignal(false);
  const [editTrigger, setEditTrigger] = createSignal<"i" | "a" | undefined>(undefined);

  async function saveChanges(text: string) {
    const newValue = props.fromText(text);
    if (newValue !== undefined && props.toText(newValue) !== props.toText(props.value)) {
      await props.onSave(newValue);
    }
  }

  const debouncedSaveChanges = debounce(saveChanges, props.debounceMs ?? 1000);

  // Handle 'i' key to enter editing mode with cursor at start, 'a' for cursor at end
  addKeyDownEventListener((event) => {
    if (event.isComposing || event.ctrlKey || event.shiftKey) return;
    if (!props.isSelected || props.isEditing) return;

    if (event.code === "KeyI") {
      event.preventDefault();
      event.stopImmediatePropagation();
      setEditTrigger("i");
      props.setIsEditing(true);
    } else if (event.code === "KeyA") {
      event.preventDefault();
      event.stopImmediatePropagation();
      setEditTrigger("a");
      props.setIsEditing(true);
    }
  });

  return (
    <div class={props.className} classList={{ [props.selectedClassName ?? ""]: props.isSelected }}>
      <Show
        when={props.isSelected && props.isEditing}
        fallback={<>{props.displayComponent ? props.displayComponent(props.value) : props.toText(props.value)}</>}
      >
        {(() => {
          let inputRef: HTMLInputElement | undefined;

          onMount(() => {
            const initialText = (props.toEditText ?? props.toText)(props.value);
            setEditText(initialText);
            if (inputRef) {
              inputRef.value = initialText;
              inputRef.focus();

              const trigger = editTrigger();
              let cursorPos: number | undefined;
              if (trigger === "i") {
                cursorPos = 0;
              } else if (trigger === "a") {
                cursorPos = initialText.length;
              } else {
                cursorPos = props.initialCursorPosition;
              }
              setEditTrigger(undefined);

              if (cursorPos !== undefined) {
                requestAnimationFrame(() => {
                  inputRef.setSelectionRange(cursorPos, cursorPos);
                });
              }
            }
          });

          // Restore cursor position when initialCursorPosition changes (e.g., after Tab indent/dedent)
          createEffect(
            on(
              () => props.initialCursorPosition,
              (cursorPos) => {
                if (cursorPos !== undefined && inputRef) {
                  requestAnimationFrame(() => {
                    inputRef.setSelectionRange(cursorPos, cursorPos);
                  });
                }
              },
              { defer: true },
            ),
          );

          return (
            <input
              ref={inputRef}
              type="text"
              class={props.editInputClassName}
              onInput={(e) => {
                const newText = e.currentTarget.value;
                setEditText(newText);
                debouncedSaveChanges(newText);
              }}
              onKeyDown={awaitable(async (e) => {
                // Stop propagation of ALL key events so parent components (tree.tsx) don't see them
                e.stopPropagation();

                // Handle Escape key - exit editing mode (common behavior)
                if (e.code === "Escape") {
                  e.preventDefault();
                  debouncedSaveChanges.clear();
                  await saveChanges(editText());
                  props.setIsEditing(false);
                  setEditText("");
                  return;
                }

                // Delegate other keys to caller
                if (props.onKeyDown && inputRef) {
                  props.onKeyDown(e, inputRef, () => setBlurSavePrevented(true));
                }
              })}
              onBlur={async (e) => {
                if (blurSavePrevented()) {
                  setBlurSavePrevented(false);
                  return;
                }
                // Skip blur handling if focus is moving to a toolbar button
                const relatedTarget = e.relatedTarget as HTMLElement | null;
                if (relatedTarget?.dataset.preventBlur !== undefined) {
                  return;
                }
                debouncedSaveChanges.clear();
                await saveChanges(editText());
                props.setIsEditing(false);
                setEditText("");
              }}
            />
          );
        })()}
      </Show>
    </div>
  );
}
