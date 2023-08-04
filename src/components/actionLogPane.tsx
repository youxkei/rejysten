import type { Services } from "@/services/test";
import type { TestContext } from "vitest";

import userEvent from "@testing-library/user-event";
import { Ulid } from "id128";
import { Show, onMount } from "solid-js";

import { ItemListChildren } from "@/components/itemList";
import { createSignalWithLock, runWithLock, useLockService, waitLockRelease } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { getBottomItem } from "@/services/rxdb/collections/listItem";
import { makeListItems } from "@/services/rxdb/collections/test";
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
          <ItemListChildren
            parentId={store.actionLogPane.currentActionLogId}
            selectedId={store.actionLogPane.currentListItemId}
          />
        </>
      )}
    </Show>
  );
}

function render(test: TestContext, setup: (services: Services) => Promise<unknown>) {
  return renderWithServicesForTest(
    test.meta.id,
    (props) => (
      <>
        <ActionLogPane />
        {props.children}
      </>
    ),
    setup
  );
}

if (import.meta.vitest) {
  describe("display", () => {
    test("normal mode", async (test) => {
      const { container, unmount } = await render(test, async ({ rxdb: { collections }, store: { updateStore } }) => {
        await collections.actionLogs.insert({
          id: "log1",
          text: "log1",
          startAt: 0,
          endAt: 0,
          updatedAt: 0,
        });
        await collections.listItems.bulkInsert(
          // prettier-ignore
          makeListItems("log1", 0, [
            ["item1", [
              ["item1_1"],
              ["item1_2"],
            ]],
            ["item2", [
              ["item2_1", [
                ["item2_1_1"]
              ]],
            ]],
          ])
        );
        await updateStore((store) => {
          store.currentPane = "actionLog";
          store.actionLogPane.currentActionLogId = "log1";
          store.actionLogPane.currentListItemId = "item1_2";
        });
      });

      test.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });

    test("insert mode", async (test) => {
      const { container, unmount, getByDisplayValue } = await render(
        test,
        async ({ rxdb: { collections }, store: { updateStore } }) => {
          await collections.actionLogs.insert({
            id: "log1",
            text: "log1",
            startAt: 0,
            endAt: 0,
            updatedAt: 0,
          });
          await collections.listItems.bulkInsert(
            // prettier-ignore
            makeListItems("log1", 0, [
              ["item1", [
                ["item1_1"],
                ["item1_2"],
              ]],
              ["item2", [
                ["item2_1", [
                  ["item2_1_1"]
                ]],
              ]],
            ])
          );
          await updateStore((store) => {
            store.currentPane = "actionLog";
            store.mode = "insert";
            store.editor.text = "item1_2";
            store.editor.cursorPosition = 3; // ite|m1_2
            store.actionLogPane.currentActionLogId = "log1";
            store.actionLogPane.currentListItemId = "item1_2";
          });
        }
      );

      test.expect(shortenClassName(container)).toMatchSnapshot();

      const input = getByDisplayValue<HTMLInputElement>("item1_2");
      test.expect(input.selectionStart).toBe(3);
      test.expect(input.selectionEnd).toBe(3);

      unmount();
    });
  });

  describe("PC operations", () => {
    describe("keyboard operations", () => {
      describe.each([
        {
          name: "press i to enter insert mode",
          key: "i",
          wantCursorPosition: 0,
        },
        {
          name: "press a to enter insert mode",
          key: "a",
          wantCursorPosition: "item1".length,
        },
      ])("$name", ({ key, wantCursorPosition }) => {
        test("assert", async (test) => {
          const user = userEvent.setup();
          const { container, unmount, lock, getByDisplayValue } = await render(
            test,
            async ({ rxdb: { collections }, store: { updateStore } }) => {
              await collections.actionLogs.insert({
                id: "log1",
                text: "log1",
                startAt: 0,
                endAt: 0,
                updatedAt: 0,
              });
              await collections.listItems.insert({
                id: "item1",
                text: "item1",
                parentId: "log1",
                prevId: "",
                nextId: "",
                updatedAt: 0,
              });
              await updateStore((store) => {
                store.currentPane = "actionLog";
                store.actionLogPane.currentActionLogId = "log1";
                store.actionLogPane.currentListItemId = "item1";
              });
            }
          );

          await user.keyboard(key);
          await waitLockRelease(lock);

          const input = getByDisplayValue<HTMLInputElement>("item1");

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
          const { container, unmount, lock, getByRole } = await render(
            test,
            async ({ rxdb: { collections }, store: { updateStore } }) => {
              await collections.actionLogs.insert({
                id: "log1",
                text: "log1",
                startAt: 0,
                endAt: 0,
                updatedAt: 0,
              });
              await collections.listItems.insert({
                id: "item1",
                text: "item1",
                parentId: "log1",
                prevId: "",
                nextId: "",
                updatedAt: 0,
              });
              await updateStore((store) => {
                store.currentPane = "actionLog";
                store.actionLogPane.currentActionLogId = "log1";
                store.actionLogPane.currentListItemId = "item1";
              });
            }
          );

          await user.keyboard(key);
          await waitLockRelease(lock);

          const input = getByRole<HTMLInputElement>("textbox");

          test.expect(shortenClassName(container)).toMatchSnapshot("after press " + key);
          test.expect(input.selectionStart).toBe(0);
          test.expect(input.selectionEnd).toBe(0);

          unmount();
        });
      });

      describe.each([
        { name: "press Tab in normal mode to indent item", key: "{Tab}" },
        {
          name: "press Shift+Tab in normal mode to dedent item",
          key: "{Shift>}{Tab}{/Shift}",
        },
      ])("$name", ({ key }) => {
        test("assert", async (test) => {
          const user = userEvent.setup();
          const { container, unmount, lock } = await render(
            test,
            async ({ rxdb: { collections }, store: { updateStore } }) => {
              await collections.actionLogs.insert({
                id: "log1",
                text: "log1",
                startAt: 1000,
                endAt: 0,
                updatedAt: 0,
              });
              await collections.listItems.bulkInsert(
                // prettier-ignore
                makeListItems("log1", 0, [
                  ["item1", [
                    ["item1_1"],
                    ["item1_2"],
                  ]],
                ])
              );
              await updateStore((store) => {
                store.currentPane = "actionLog";
                store.actionLogPane.currentActionLogId = "log1";
                store.actionLogPane.currentListItemId = "item1_2";
              });
            }
          );

          await user.keyboard(key);
          await waitLockRelease(lock);

          test.expect(shortenClassName(container)).toMatchSnapshot("after press " + key);

          unmount();
        });
      });

      describe.each([
        { name: "press Tab in insert mode to indent item", key: "{Tab}" },
        {
          name: "press Shift+Tab in insert mode to dedent item",
          key: "{Shift>}{Tab}{/Shift}",
        },
      ])("$name", ({ key }) => {
        test("assert", async (test) => {
          const cursorPosition = Math.floor(Math.random() * ("item3".length + 1));

          const user = userEvent.setup();
          const { container, unmount, lock, getByDisplayValue } = await render(
            test,
            async ({ rxdb: { collections }, store: { updateStore } }) => {
              await collections.actionLogs.insert({
                id: "log1",
                text: "log1",
                startAt: 1000,
                endAt: 0,
                updatedAt: 0,
              });
              await collections.listItems.bulkInsert(
                // prettier-ignore
                makeListItems("log1", 0, [
                  ["item1", [
                    ["item1_1"],
                    ["item1_2"],
                  ]],
                ])
              );
              await updateStore((store) => {
                store.currentPane = "actionLog";
                store.mode = "insert";
                store.editor.text = "item1_2";
                store.editor.cursorPosition = cursorPosition;
                store.actionLogPane.currentActionLogId = "log1";
                store.actionLogPane.currentListItemId = "item1_2";
              });
            }
          );

          await user.keyboard(key);
          await waitLockRelease(lock);

          const input = getByDisplayValue<HTMLInputElement>("item1_2");

          test.expect(shortenClassName(container)).toMatchSnapshot("after press " + key);
          test.expect(input.selectionStart).toBe(cursorPosition);
          test.expect(input.selectionEnd).toBe(cursorPosition);

          unmount();
        });
      });

      test("press Backspace to remove a character", async (test) => {
        const user = userEvent.setup();
        const { container, unmount, lock, getByDisplayValue } = await render(
          test,
          async ({ rxdb: { collections }, store: { updateStore } }) => {
            await collections.actionLogs.insert({
              id: "log1",
              text: "log1",
              startAt: 1000,
              endAt: 0,
              updatedAt: 0,
            });
            await collections.listItems.bulkInsert(
              // prettier-ignore
              makeListItems("log1", 0, [
                ["item1"],
                ["item2"],
              ])
            );

            await updateStore((store) => {
              store.currentPane = "actionLog";
              store.mode = "insert";
              store.editor.cursorPosition = 3; // ite|m2
              store.actionLogPane.currentActionLogId = "log1";
              store.actionLogPane.currentListItemId = "item2";
            });
          }
        );

        await user.keyboard("{Backspace}");
        await waitLockRelease(lock);

        const input = getByDisplayValue<HTMLInputElement>("itm2");

        test.expect(shortenClassName(container)).toMatchSnapshot("after press Backspace");
        test.expect(input.selectionStart).toBe(2);
        test.expect(input.selectionEnd).toBe(2);

        unmount();
      });

      describe("press Backspace but nothing happened", () => {
        describe.each([
          {
            name: "cursor is on the left edge, has children",
            // prettier-ignore
            items: makeListItems("log1", 0, [
              ["item1"],
              ["item2", [
                ["item2_1"],
              ]],
            ]),
            currentItem: "item2",
          },
          {
            name: "cursor is on the left edge, no above item, has below item",
            // prettier-ignore
            items: makeListItems("log1", 0, [
              ["item1"],
              ["item2"],
            ]),
            currentItem: "item1",
          },
        ])("$name", ({ items, currentItem }) => {
          test("assert", async (test) => {
            const user = userEvent.setup();
            const { container, unmount, lock, getByDisplayValue } = await render(
              test,
              async ({ rxdb: { collections }, store: { updateStore } }) => {
                await collections.actionLogs.insert({
                  id: "log1",
                  text: "log1",
                  startAt: 0,
                  endAt: 0,
                  updatedAt: 0,
                });
                await collections.listItems.bulkInsert(items);
                await updateStore((store) => {
                  store.currentPane = "actionLog";
                  store.mode = "insert";
                  store.editor.text = currentItem;
                  store.editor.cursorPosition = 0;
                  store.actionLogPane.currentActionLogId = "log1";
                  store.actionLogPane.currentListItemId = currentItem;
                });
              }
            );

            await user.keyboard("{Backspace}");
            await waitLockRelease(lock);

            const input = getByDisplayValue<HTMLInputElement>(currentItem);

            test.expect(shortenClassName(container)).toMatchSnapshot("after press Backspace");
            test.expect(input.selectionStart).toBe(0);
            test.expect(input.selectionEnd).toBe(0);

            unmount();
          });
        });
      });

      describe("press Backspace to remove item", () => {
        test("cursor is on the left edge, no children, has above item: item is removed and move to above item", async (test) => {
          const user = userEvent.setup();
          const { container, unmount, lock, getByDisplayValue } = await render(
            test,
            async ({ rxdb: { collections }, store: { updateStore } }) => {
              await collections.actionLogs.insert({
                id: "log1",
                text: "log1",
                startAt: 0,
                endAt: 0,
                updatedAt: 0,
              });
              await collections.listItems.bulkInsert(
                // prettier-ignore
                makeListItems("log1", 0, [
                  ["item1"],
                  ["item2"],
                ])
              );
              await updateStore((store) => {
                store.currentPane = "actionLog";
                store.mode = "insert";
                store.editor.cursorPosition = 0;
                store.actionLogPane.currentActionLogId = "log1";
                store.actionLogPane.currentListItemId = "item2";
              });
            }
          );

          await user.keyboard("{Backspace}");
          await waitLockRelease(lock);

          const input = getByDisplayValue<HTMLInputElement>("item1item2");

          test.expect(shortenClassName(container)).toMatchSnapshot("after press Backspace");
          test.expect(input.selectionStart).toBe(5);
          test.expect(input.selectionEnd).toBe(5);

          unmount();
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
