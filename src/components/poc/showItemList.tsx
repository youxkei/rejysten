import { ItemListChildren } from "@/components/itemList";
import { useStoreService } from "@/services/store";

export function ShowItemList() {
  const { store } = useStoreService();

  return <ItemListChildren parentId="__testItemList" selectedId={store.actionLogPage.currentListItemId} />;
}
