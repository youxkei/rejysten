import { debounce } from "@solid-primitives/scheduled";
import { createSignal, Show, type JSX, onMount } from "solid-js";

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
  // Tab navigation callback
  onTabPress?: (shiftKey: boolean) => void;
  // Enter key callback with cursor position info
  onEnterPress?: (beforeCursor: string, afterCursor: string) => void;
  // Initial cursor position when entering edit mode
  initialCursorPosition?: number;
  debugId?: string;
}

export function EditableValue<V>(props: EditableValueProps<V>) {
  const [editText, setEditText] = createSignal("");
  const [isTabPressed, setIsTabPressed] = createSignal(false);
  const [isEnterPressed, setIsEnterPressed] = createSignal(false);

  async function saveChanges(text: string) {
    const newValue = props.fromText(text);
    if (newValue !== undefined && props.toText(newValue) !== props.toText(props.value)) {
      await props.onSave(newValue);
    }
  }

  const debouncedSaveChanges = debounce(saveChanges, props.debounceMs ?? 1000);

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
              const cursorPos = props.initialCursorPosition;
              if (cursorPos !== undefined) {
                requestAnimationFrame(() => {
                  inputRef.setSelectionRange(cursorPos, cursorPos);
                });
              }
            }
          });

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
              onKeyDown={async (e) => {
                // Handle Tab key
                if (e.code === "Tab") {
                  e.preventDefault();
                  e.stopPropagation();

                  setIsTabPressed(true);
                  // Save changes
                  debouncedSaveChanges.clear();
                  await saveChanges(editText());

                  if (props.onTabPress) {
                    // Call the Tab navigation callback if provided
                    props.onTabPress(e.shiftKey);
                  } else {
                    // If no onTabPress callback, behave like Escape (exit editing mode)
                    props.setIsEditing(false);
                    setEditText("");
                  }
                }

                // Handle Enter key (ignore during IME composition)
                if (e.code === "Enter" && props.onEnterPress && !e.isComposing) {
                  e.preventDefault();
                  e.stopPropagation();

                  setIsEnterPressed(true);
                  const cursorPos = inputRef?.selectionStart ?? editText().length;
                  const beforeCursor = editText().slice(0, cursorPos);
                  const afterCursor = editText().slice(cursorPos);

                  debouncedSaveChanges.clear();
                  props.onEnterPress(beforeCursor, afterCursor);
                }
              }}
              onBlur={async () => {
                // Ignore blur if Tab was pressed
                if (isTabPressed()) {
                  setIsTabPressed(false);
                  return;
                }
                // Ignore blur if Enter was pressed
                if (isEnterPressed()) {
                  setIsEnterPressed(false);
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
