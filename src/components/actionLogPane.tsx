import userEvent from "@testing-library/user-event";
import { Ulid } from "id128";
import { Show, onMount } from "solid-js";

import { ItemListChildren } from "@/components/itemList";
import { createSignalWithLock, runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { getBottomItem } from "@/services/rxdb/collections/listItem";
import { createSubscribeSignal } from "@/services/rxdb/subscribe";
import { useStoreService } from "@/services/store";
import { renderWithServicesForTest } from "@/services/test";
import { shortenClassName } from "@/test";

export function ActionLogPane() {
  const rxdb = useRxDBService();
  const lock = useLockService();
  const { store, updateStore } = useStoreService();

  onMount(() => {
    if (store.actionLogPane.currentListItemId !== "") return;

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
      describe.each([
        { name: "press i to enter insert mode", key: "i", text: "text", wantCursorPosition: 0 },
        { name: "press a to enter insert mode", key: "a", text: "text", wantCursorPosition: 4 },
      ])("$name", ({ key, text, wantCursorPosition }) => {
        test("assert", async (test) => {
          const user = userEvent.setup();
          const { container, unmount, findByDisplayValue } = await renderWithServicesForTest(
            test.meta.id,
            (props) => (
              <>
                <ActionLogPane />
                {props.children}
              </>
            ),
            async ({ rxdb: { collections }, store: { updateStore } }) => {
              await collections.actionLogs.insert({ id: "root", text: "root", startAt: 0, endAt: 0, updatedAt: 0 });
              await collections.listItems.insert({ id: "1", text, parentId: "root", prevId: "", nextId: "", updatedAt: 0 });
              await updateStore((store) => {
                store.currentPane = "actionLog";
                store.actionLogPane.currentActionLogId = "root";
                store.actionLogPane.currentListItemId = "1";
              });
            }
          );

          test.expect(shortenClassName(container)).toMatchSnapshot("initial");

          await user.keyboard(key);

          const input = await findByDisplayValue<HTMLInputElement>("text");

          test.expect(shortenClassName(container)).toMatchSnapshot("after press " + key);
          test.expect(input.selectionStart).toBe(wantCursorPosition);
          test.expect(input.selectionEnd).toBe(wantCursorPosition);

          unmount();
        });
      });

      describe.each([
        { name: "press o to add item below", key: "o" },
        { name: "press O to add item above", key: "{Shift>}o{/Shift}" },
      ])("$name", ({ key }) => {
        test("assert", async (test) => {
          const user = userEvent.setup();
          const { container, unmount, findByRole } = await renderWithServicesForTest(
            test.meta.id,
            (props) => (
              <>
                <ActionLogPane />
                {props.children}
              </>
            ),
            async ({ rxdb: { collections }, store: { updateStore } }) => {
              await collections.actionLogs.insert({ id: "root", text: "root", startAt: 0, endAt: 0, updatedAt: 0 });
              await collections.listItems.insert({ id: "1", text: "text", parentId: "root", prevId: "", nextId: "", updatedAt: 0 });
              await updateStore((store) => {
                store.currentPane = "actionLog";
                store.actionLogPane.currentActionLogId = "root";
                store.actionLogPane.currentListItemId = "1";
              });
            }
          );

          test.expect(shortenClassName(container)).toMatchSnapshot("initial");

          await user.keyboard(key);

          const input = await findByRole<HTMLInputElement>("textbox");

          test.expect(shortenClassName(container)).toMatchSnapshot("after press " + key);
          test.expect(input.selectionStart).toBe(0);
          test.expect(input.selectionEnd).toBe(0);

          unmount();
        });
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
        test.skip("cursor is not on the left edge: item is not removed", () => {
          // TODO
        });

        test.skip("cursor is on the left edge, has children: item is not removed", () => {
          // TODO
        });

        test.skip("cursor is on the left edge, no children, no above item, has below item: item is not removed", () => {
          // TODO
        });

        test.skip("cursor is on the left edge, no children, has above item: item is removed and move to above item", () => {
          // TODO
        });

        test.skip("text is empty, no parent, no children, no above item, no below item: item is removed and move to ActionLogListPane", () => {
          // TODO
        });
      });

      describe("press Delete to remove below item", () => {
        test.skip("cursor is not on the right edge: below item is not removed", () => {
          // TODO
        });

        test.skip("cursor is on the right edge, no below item: nothing happened", () => {
          // TODO
        });

        test.skip("cursor is on the right edge, below item has children: below item is not removed", () => {
          // TODO
        });

        test.skip("cursor is on the right edge, below item has no children: below item is removed text is merged", () => {
          // TODO
        });
      });

      describe("press Enter to add item", () => {
        test.skip("cursor is on the right edge: empty item is added and move to added item", () => {
          // TODO
        });

        test.skip("cursor is in the middle of text: non-empty item is added and move to added item", () => {
          // TODO
        });
      });
    });
  });
}
