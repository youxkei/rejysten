import { createEffect } from "solid-js";

import { ItemListChildren } from "@/components/itemList";
import { useStoreService } from "@/services/store";

export function ShowItemList() {
  const { store, updateStore } = useStoreService();

  let initial = true;
  createEffect(() => {});

  return <ItemListChildren parentId="__testItemList" selectedId={store.actionLogPane.currentListItemId} />;
}
