import { Show, createSignal, startTransition, createEffect } from "solid-js";

import { ItemList, ItemListChildren } from "@/components/itemList";
import { useRxDBService } from "@/services/rxdb";
import { useStoreService } from "@/services/store";

export function ShowItemList() {
  const { store, updateStore$ } = useStoreService();
  const { collections } = useRxDBService();

  async function onClick() {
    console.log("store:", (await collections.stores.findOne("const").exec())?.toJSON());
    console.log("locks:", (await collections.locks.findOne("const").exec())?.toJSON());
    console.log(
      "listItems:",
      (await collections.listItems.find().exec())?.map((item) => item.toJSON())
    );
  }

  return (
    <>
      <ItemListChildren parentId="__testItemList" selectedId={store.actionLogPage.currentListItemId} />
      <button onClick={onClick}>check</button>
    </>
  );
}
