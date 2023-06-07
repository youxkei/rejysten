import { Ulid } from "id128";
import { Show, onMount } from "solid-js";

import { ItemListChildren } from "@/components/itemList";
import { createSignalWithLock, runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { getBottomItem } from "@/services/rxdb/collections/listItem";
import { createSubscribeSignal } from "@/services/rxdb/subscribe";
import { useStoreService } from "@/services/store";

export function ActionLogPane() {
  const rxdb = useRxDBService();
  const lock = useLockService();
  const { store, updateStore } = useStoreService();

  onMount(() => {
    void runWithLock(lock, async () => {
      const bottomItem = await getBottomItem(rxdb, store.actionLogPane.currentActionLogId);

      let id = "";
      if (bottomItem) {
        id = bottomItem.id;
      } else {
        const now = Date.now();
        id = Ulid.generate({ time: now }).toCanonical();

        await rxdb.collections.listItems.insert({
          id,
          text: "",
          nextId: "",
          prevId: "",
          parentId: store.actionLogPane.currentActionLogId,
          updatedAt: Date.now(),
        });
      }

      await updateStore((store) => {
        store.actionLogPane.currentListItemId = id;
      });
    });
  });

  const actionLog$ = createSignalWithLock(
    lock,
    createSubscribeSignal(() => rxdb.collections.actionLogs.findOne(store.actionLogPane.currentActionLogId)),
    null
  );

  return (
    <Show when={actionLog$()}>
      {(actionLog$) => (
        <>
          {actionLog$().text}
          <ItemListChildren parentId={store.actionLogPane.currentActionLogId} selectedId={store.actionLogPane.currentListItemId} />
        </>
      )}
    </Show>
  );
}

if (import.meta.vitest) {
  describe("PC operations", () => {
    describe("keyboard operations", () => {
      test.skip("press o to add item below", () => {
        // TODO
      });

      test.skip("press O to add item above", () => {
        // TODO
      });

      test.skip("press H to move to ActionLogListPane", () => {
        // TODO
      });

      test.skip("press Tab in normal mode to indent item", () => {
        // TODO
      });

      test.skip("press Tab in insert mode to indent item", () => {
        // TODO
      });

      test.skip("press Shift+Tab in normal mode to dedent item", () => {
        // TODO
      });

      test.skip("press Shift+Tab in insert mode to dedent item", () => {
        // TODO
      });

      describe("press Backspace to remove item", () => {
        test.skip("text is not empty: item is not removed", () => {
          // TODO
        });

        test.skip("text is empty, has children: item is not removed", () => {
          // TODO
        });

        test.skip("text is empty, no children, no above item, has below item: item is not removed", () => {
          // TODO
        });

        test.skip("text is empty, no children, has above item: item is removed and move to above item", () => {
          // TODO
        });

        test.skip("text is empty, no children, no above item, no below item: item is removed and move to ActionLogListPane", () => {
          // TODO
        });
      });
    });
  });
}
