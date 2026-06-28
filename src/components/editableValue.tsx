import { debounce } from "@solid-primitives/scheduled";
import { type Accessor, createEffect, createSignal, For, type JSX, on, onCleanup, onMount, Show } from "solid-js";

import { addKeyDownEventListener } from "@/solid/event";
import { styles } from "@/styles.css";

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
  // Opt-in text completion: a reactive list of completion candidates (already
  // deduped and length-limited by the caller). The caller is responsible for
  // computing these from the current edit text (fed back via onTextChange).
  completion?: { items$: Accessor<string[]> };
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
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
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
          let isUnmounting = false;

          // Text completion (opt-in via props.completion)
          const completionItems$ = () => props.completion?.items$() ?? [];
          const [highlightedIndex$, setHighlightedIndex] = createSignal(-1);
          const [completionDismissed$, setCompletionDismissed] = createSignal(false);
          const showCompletion$ = () => !!props.completion && !completionDismissed$() && completionItems$().length > 0;

          function acceptCompletion(text: string) {
            if (!inputRef) return;
            inputRef.value = text;
            setEditText(text);
            debouncedSaveChanges(text);
            props.onTextChange?.(text);
            inputRef.setSelectionRange(text.length, text.length);
            props.onSelectionChange?.(text.length);
            inputRef.focus();
            setCompletionDismissed(true);
            setHighlightedIndex(-1);
          }

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
                inputRef.setSelectionRange(cursorPos, cursorPos);
                props.onSelectionChange?.(cursorPos);
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

          onCleanup(() => {
            isUnmounting = true;
            debouncedSaveChanges.clear();
          });

          const inputEl = (
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
                // Typing re-opens the completion dropdown and resets highlight
                setCompletionDismissed(false);
                setHighlightedIndex(-1);
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

                // Completion dropdown navigation (skip while IME is composing so Enter/Arrow go to the IME)
                if (showCompletion$() && !e.isComposing) {
                  const candidates = completionItems$();
                  if (e.code === "ArrowDown") {
                    e.preventDefault();
                    setHighlightedIndex((i) => Math.min(i + 1, candidates.length - 1));
                    return;
                  }
                  if (e.code === "ArrowUp") {
                    e.preventDefault();
                    setHighlightedIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.code === "Enter") {
                    const index = highlightedIndex$();
                    if (index >= 0 && index < candidates.length) {
                      e.preventDefault();
                      acceptCompletion(candidates[index]);
                      return;
                    }
                  }
                  if (e.code === "Escape") {
                    // First Escape only closes the dropdown; editing continues
                    e.preventDefault();
                    setCompletionDismissed(true);
                    setHighlightedIndex(-1);
                    return;
                  }
                }

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
                if (isUnmounting) return;
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

          // Wrap with the completion dropdown only when completion is enabled, so
          // non-completion fields (startAt/endAt, tree nodes) keep their bare input.
          if (!props.completion) return inputEl;

          return (
            <div class={styles.editableValue.completionWrapper}>
              {inputEl}
              <Show when={showCompletion$()}>
                <ul class={styles.editableValue.completionList}>
                  <For each={completionItems$()}>
                    {(candidate, i) => (
                      <li
                        class={styles.editableValue.completionItem}
                        classList={{
                          [styles.editableValue.completionItemHighlighted]: highlightedIndex$() === i(),
                        }}
                        // mousedown preventDefault keeps the input focused so blur-save doesn't fire
                        // before the click; the accept runs on click, which fires for mouse and tap
                        // alike. (Same pattern as the mobile editing toolbar buttons.)
                        onMouseDown={(e) => {
                          e.preventDefault();
                        }}
                        onClick={() => {
                          acceptCompletion(candidate);
                        }}
                      >
                        {candidate}
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          );
        })()}
      </Show>
    </div>
  );
}
