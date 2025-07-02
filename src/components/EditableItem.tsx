import { debounce } from "@solid-primitives/scheduled";
import { type Accessor, createSignal, onMount, type Setter, Show } from "solid-js";

import { addKeyDownEventListener } from "@/solid/event";

export interface EditableItemProps<T extends { id: string; text: string }> {
  item$: Accessor<T>;
  isSelected$: Accessor<boolean>;
  isEditing$: Accessor<boolean>;
  setIsEditing: Setter<boolean>;
  onSave: (itemId: string, newText: string) => Promise<void>;
  className?: string;
  selectedClassName?: string;
  editInputClassName?: string;
  debounceMs?: number;
}

export function EditableItem<T extends { id: string; text: string }>(props: EditableItemProps<T>) {
  const [editText, setEditText] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  async function saveChanges(text: string) {
    const item = props.item$();
    if (text !== item.text) {
      await props.onSave(item.id, text);
    }
  }

  const debouncedSaveChanges = debounce(saveChanges, props.debounceMs ?? 1000);

  addKeyDownEventListener(async (e: KeyboardEvent) => {
    if (e.code === "KeyI" && props.isSelected$() && !props.isEditing$()) {
      e.preventDefault();
      e.stopPropagation();

      setEditText(props.item$().text);
      props.setIsEditing(true);

      onMount(() => {
        inputRef?.focus();
      });
    } else if (e.code === "Escape" && props.isSelected$() && props.isEditing$()) {
      e.preventDefault();
      e.stopPropagation();

      debouncedSaveChanges.clear();

      await saveChanges(editText());

      props.setIsEditing(false);
      setEditText("");
    }
  });

  return (
    <div class={props.className} classList={{ [props.selectedClassName ?? ""]: props.isSelected$() }}>
      <Show when={props.isSelected$() && props.isEditing$()} fallback={props.item$().text}>
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
          onBlur={async () => {
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
