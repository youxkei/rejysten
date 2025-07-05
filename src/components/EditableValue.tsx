import { debounce } from "@solid-primitives/scheduled";
import { createSignal, Show, type Setter, type JSX, createEffect } from "solid-js";

import { addKeyDownEventListener } from "@/solid/event";

export interface EditableValueProps<V> {
  value: V;
  onSave: (newValue: V) => Promise<void>;
  isSelected: boolean;
  isEditing: boolean;
  setIsEditing: Setter<boolean>;
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
}

export function EditableValue<V>(props: EditableValueProps<V>) {
  const [editText, setEditText] = createSignal("");
  const [isTabPressed, setIsTabPressed] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  async function saveChanges(text: string) {
    const newValue = props.fromText(text);
    if (newValue !== undefined && props.toText(newValue) !== props.toText(props.value)) {
      await props.onSave(newValue);
    }
  }

  const debouncedSaveChanges = debounce(saveChanges, props.debounceMs ?? 1000);

  // Focus the input when editing becomes true
  createEffect(() => {
    if (props.isEditing) {
      setEditText((props.toEditText ?? props.toText)(props.value));
      inputRef?.focus();
    }
  });

  // Add key event listeners for "i" and "Escape"
  addKeyDownEventListener(async (e: KeyboardEvent) => {
    if (e.code === "KeyI" && props.isSelected && !props.isEditing) {
      e.preventDefault();
      e.stopPropagation();
      props.setIsEditing(true);
    } else if (e.code === "Escape" && props.isSelected && props.isEditing) {
      e.preventDefault();
      e.stopPropagation();

      debouncedSaveChanges.clear();
      await saveChanges(editText());
      props.setIsEditing(false);
      setEditText("");
    }
  });

  return (
    <div class={props.className} classList={{ [props.selectedClassName ?? ""]: props.isSelected }}>
      <Show
        when={props.isSelected && props.isEditing}
        fallback={<>{props.displayComponent ? props.displayComponent(props.value) : props.toText(props.value)}</>}
      >
        <input
          ref={inputRef}
          type="text"
          class={props.editInputClassName}
          value={editText()}
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
          }}
          onBlur={async () => {
            // Ignore blur if Tab was pressed
            if (isTabPressed()) {
              setIsTabPressed(false);
              return;
            }
            debouncedSaveChanges.clear();
            await saveChanges(editText());
            props.setIsEditing(false);
            setEditText("");
          }}
        />
      </Show>
    </div>
  );
}
