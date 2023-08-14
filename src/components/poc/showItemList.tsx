import { ItemListChildren } from "@/components/itemList";
import { useStoreService } from "@/services/store";

export function ShowItemList() {
  const { state } = useStoreService();

  return <ItemListChildren parentId="__testItemList" selectedId={state.actionLogPane.currentListItemId} />;
}
