import { debounce } from "@solid-primitives/scheduled";
import { createEffect, createSignal, on, Show, type JSX, onMount } from "solid-js";

import { addKeyDownEventListener } from "@/solid/event";

export interface EditableValueProps<V> {
  value: V;
  onSave: (newValue: V, stopEditing: boolean) => void;
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
  // Callback when input text changes (called on every input)
  onTextChange?: (text: string) => void;
  // Callback when selection/cursor position changes
  onSelectionChange?: (selectionStart: number) => void;
  // Callback when input element becomes available (for direct manipulation)
  onInputRef?: (inputRef: HTMLInputElement) => void;
  // Callback to receive the preventBlurSave function
  onPreventBlurSave?: (fn: () => void) => void;
  debugId?: string;
}

export function EditableValue<V>(props: EditableValueProps<V>) {
  const [editText, setEditText] = createSignal("");
  const [blurSavePrevented, setBlurSavePrevented] = createSignal(false);
  const [editTrigger, setEditTrigger] = createSignal<"i" | "a" | undefined>(undefined);

  function saveChanges(text: string, stopEditing: boolean) {
    const newValue = props.fromText(text);
    if (newValue !== undefined && props.toText(newValue) !== props.toText(props.value)) {
      props.onSave(newValue, stopEditing);
    } else if (stopEditing) {
      // No changes, but still need to stop editing
      props.onSave(props.value, stopEditing);
    }
  }

  const debouncedSaveChanges = debounce((text: string) => {
    saveChanges(text, false);
  }, props.debounceMs ?? 1000);

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
            props.onTextChange?.(initialText);
            props.onPreventBlurSave?.(() => setBlurSavePrevented(true));
            if (inputRef) {
              props.onInputRef?.(inputRef);
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
                  props.onSelectionChange?.(cursorPos);
                });
              } else {
                props.onSelectionChange?.(inputRef.selectionStart ?? 0);
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
                    props.onSelectionChange?.(cursorPos);
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
                props.onTextChange?.(newText);
                props.onSelectionChange?.(e.currentTarget.selectionStart ?? 0);
              }}
              onKeyUp={(e) => {
                props.onSelectionChange?.(e.currentTarget.selectionStart ?? 0);
              }}
              onClick={(e) => {
                props.onSelectionChange?.(e.currentTarget.selectionStart ?? 0);
              }}
              onSelect={(e) => {
                props.onSelectionChange?.(e.currentTarget.selectionStart ?? 0);
              }}
              onKeyDown={(e) => {
                // Update selection position at the start of key handling
                props.onSelectionChange?.(e.currentTarget.selectionStart ?? 0);

                // Stop propagation of ALL key events so parent components (tree.tsx) don't see them
                e.stopPropagation();

                // Handle Escape key - exit editing mode (common behavior)
                if (e.code === "Escape") {
                  e.preventDefault();
                  debouncedSaveChanges.clear();
                  setBlurSavePrevented(true);
                  saveChanges(editText(), true);
                  setEditText("");
                  return;
                }

                // Delegate other keys to caller
                if (props.onKeyDown && inputRef) {
                  props.onKeyDown(e, inputRef, () => setBlurSavePrevented(true));
                }
              }}
              onBlur={() => {
                if (blurSavePrevented()) {
                  setBlurSavePrevented(false);
                  return;
                }
                debouncedSaveChanges.clear();
                saveChanges(editText(), true);
                setEditText("");
              }}
            />
          );
        })()}
      </Show>
    </div>
  );
}
