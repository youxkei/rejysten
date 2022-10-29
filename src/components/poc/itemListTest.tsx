import { Show, createSignal, startTransition } from "solid-js";

import { ItemList } from "@/components/itemList";

export function ItemListTest() {
  const [id, setId] = createSignal("");

  return (
    <>
      <Show when={id()}>
        <ItemList id={id()} />
      </Show>
      <input
        onInput={(e) => {
          const id = e.currentTarget.value;
          startTransition(() => setId(id));
        }}
      />
    </>
  );
}
