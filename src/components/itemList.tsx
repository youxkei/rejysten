import { Show, For } from "solid-js";

import { useCollections, useSubscribe } from "@/rxdb";
import { BulletList } from "@/components/bulletList";

export function ItemList(props: { id: string }) {
  return (
    <BulletList
      bullet={"•"}
      item={<ItemListItem id={props.id} />}
      child={<ItemListChildren parentId={props.id} />}
    />
  );
}

export function ItemListItem(props: { id: string }) {
  const collections = useCollections();
  const listItem = useSubscribe(
    () => collections()?.listItems.findOne(props.id),
    null
  );

  return (
    <Show when={listItem()}>
      <span>{listItem()!.text}</span>
    </Show>
  );
}

export function ItemListChildren(props: { parentId: string }) {
  const collections = useCollections();
  const children = useSubscribe(
    () =>
      collections()?.listItems.find({ selector: { parentId: props.parentId } }),
    [],
    (prevs, nexts) => {
      if (prevs.length !== nexts.length) {
        return false;
      } else {
        prevs.forEach((lhs, i) => {
          if (lhs.id !== nexts[i].id) {
            return false;
          }
        });

        return true;
      }
    }
  );

  return (
    <>
      <For each={children()}>{(child) => <ItemList id={child.id} />}</For>
    </>
  );
}
