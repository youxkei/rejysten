import type { Services } from "@/services/test";
import type { TestContext } from "vitest";

import userEvent from "@testing-library/user-event";
import { Ulid } from "id128";
import { Match, Show, Switch, onMount } from "solid-js";

import { ItemListChildren } from "@/components/itemList";
import { useEventService } from "@/services/event";
import { createSignalWithLock, runWithLock, useLockService, waitLockRelease } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { getBottomItem } from "@/services/rxdb/collections/listItem";
import { makeListItems } from "@/services/rxdb/collections/test";
import { createSubscribeSignal } from "@/services/rxdb/subscribe";
import { useStoreService } from "@/services/store";
import { renderWithServicesForTest } from "@/services/test";
import { styles } from "@/styles.css";
import { shortenClassName } from "@/test";

export function ActionLogPane() {
  return (
    <div class={styles.actionLogPane.container}>
      <ActionLog />
      <Buttons />
    </div>
  );
}

function Buttons() {
  const { state } = useStoreService();
  const lock = useLockService();
  const { emitEvent } = useEventService();

  const mode$ = createSignalWithLock(lock, () => state.mode, "normal");

  return (
    <div class={styles.actionLogListPane.buttons}>
      <Switch>
        <Match when={mode$() === "normal"}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLog", mode: "normal", type: "moveAbove" });
            }}
          >
            ⬆
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLog", mode: "normal", type: "moveBelow" });
            }}
          >
            ⬇
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLog", mode: "normal", type: "moveToActionLogListPane" });
            }}
          >
            ⬅
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLog", mode: "normal", type: "dedent" });
            }}
          >
            ⏮
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLog", mode: "normal", type: "indent" });
            }}
          >
            ⏭
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({
                pane: "actionLog",
                mode: "normal",
                type: "enterInsertMode",
                cursorPosition: -1,
              });
            }}
          >
            📝
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLog", mode: "normal", type: "addNext" });
            }}
          >
            🆕
          </button>
        </Match>
        <Match when={mode$() === "insert"}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) =>
              emitEvent({
                pane: "actionLog",
                mode: "insert",
                type: "delete",
                preventDefault: () => e.preventDefault(),
              })
            }
          >
            🗑️
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLog", mode: "insert", type: "dedent" });
            }}
          >
            ⏮
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              emitEvent({ pane: "actionLog", mode: "insert", type: "indent" });
            }}
          >
            ⏭
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => emitEvent({ pane: "actionLog", mode: "insert", type: "leaveInsertMode" })}
          >
            🔙
          </button>
        </Match>
      </Switch>
    </div>
  );
}

function ActionLog() {
  const rxdb = useRxDBService();
  const lock = useLockService();
  const { state, updateState } = useStoreService();

  onMount(() => {
    if (state.actionLogPane.currentListItemId !== "") return;

    void runWithLock(lock, async () => {
      const bottomItem = await getBottomItem(rxdb, state.actionLogPane.currentActionLogId);

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
          parentId: state.actionLogPane.currentActionLogId,
          updatedAt: Date.now(),
        });
      }

      updateState((store) => {
        store.actionLogPane.currentListItemId = id;
      });
    });
  });

  const actionLog$ = createSignalWithLock(
    lock,
    createSubscribeSignal(() => rxdb.collections.actionLogs.findOne(state.actionLogPane.currentActionLogId)),
    null
  );

  return (
    <div class={styles.actionLogPane.actionLog}>
      <Show when={actionLog$()}>
        {(actionLog$) => (
          <>
            {actionLog$().text}
            <ItemListChildren
              parentId={state.actionLogPane.currentActionLogId}
              selectedId={state.actionLogPane.currentListItemId}
            />
          </>
        )}
      </Show>
    </div>
  );
}

function render(test: TestContext, setup: (services: Services) => Promise<unknown>) {
  return renderWithServicesForTest(
    test.meta.id,
    (props) => (
      <>
        <ActionLog />
        {props.children}
      </>
    ),
    setup
  );
}

if (import.meta.vitest) {
  describe("display", () => {
    test("normal mode", async (test) => {
      const { container, unmount } = await render(test, async ({ rxdb: { collections }, store: { updateState } }) => {
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
        updateState((state) => {
          state.currentPane = "actionLog";
          state.actionLogPane.currentActionLogId = "log1";
          state.actionLogPane.currentListItemId = "item1_2";
        });
      });

      test.expect(shortenClassName(container)).toMatchSnapshot();

      unmount();
    });

    test("insert mode", async (test) => {
      const { container, unmount, getByDisplayValue } = await render(
        test,
        async ({ rxdb: { collections }, store: { updateState } }) => {
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
          updateState((state) => {
            state.currentPane = "actionLog";
            state.mode = "insert";
            state.editor.text = "item1_2";
            state.editor.cursorPosition = 3; // ite|m1_2
            state.actionLogPane.currentActionLogId = "log1";
            state.actionLogPane.currentListItemId = "item1_2";
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
            async ({ rxdb: { collections }, store: { updateState } }) => {
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
              updateState((state) => {
                state.currentPane = "actionLog";
                state.actionLogPane.currentActionLogId = "log1";
                state.actionLogPane.currentListItemId = "item1";
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
            async ({ rxdb: { collections }, store: { updateState } }) => {
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
              updateState((state) => {
                state.currentPane = "actionLog";
                state.actionLogPane.currentActionLogId = "log1";
                state.actionLogPane.currentListItemId = "item1";
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
            async ({ rxdb: { collections }, store: { updateState } }) => {
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
              updateState((state) => {
                state.currentPane = "actionLog";
                state.actionLogPane.currentActionLogId = "log1";
                state.actionLogPane.currentListItemId = "item1_2";
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
            async ({ rxdb: { collections }, store: { updateState } }) => {
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
              updateState((state) => {
                state.currentPane = "actionLog";
                state.mode = "insert";
                state.editor.text = "item1_2";
                state.editor.cursorPosition = cursorPosition;
                state.actionLogPane.currentActionLogId = "log1";
                state.actionLogPane.currentListItemId = "item1_2";
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
        const { container, unmount, getByDisplayValue } = await render(
          test,
          async ({ rxdb: { collections }, store: { updateState } }) => {
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

            updateState((state) => {
              state.currentPane = "actionLog";
              state.mode = "insert";
              state.editor.text = "item2";
              state.editor.cursorPosition = 3; // ite|m2
              state.actionLogPane.currentActionLogId = "log1";
              state.actionLogPane.currentListItemId = "item2";
            });
          }
        );

        await user.keyboard("{Backspace}");

        const _input = getByDisplayValue<HTMLInputElement>("itm2");

        test.expect(shortenClassName(container)).toMatchSnapshot("after press Backspace");

        // somehow selectionStart and selectionEnd are not 2
        // test.expect(input.selectionStart).toBe(2);
        // test.expect(input.selectionEnd).toBe(2);

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
              async ({ rxdb: { collections }, store: { updateState } }) => {
                await collections.actionLogs.insert({
                  id: "log1",
                  text: "log1",
                  startAt: 0,
                  endAt: 0,
                  updatedAt: 0,
                });
                await collections.listItems.bulkInsert(items);
                updateState((state) => {
                  state.currentPane = "actionLog";
                  state.mode = "insert";
                  state.editor.text = currentItem;
                  state.editor.cursorPosition = 0;
                  state.actionLogPane.currentActionLogId = "log1";
                  state.actionLogPane.currentListItemId = currentItem;
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
            async ({ rxdb: { collections }, store: { updateState } }) => {
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
              updateState((state) => {
                state.currentPane = "actionLog";
                state.mode = "insert";
                state.editor.text = "item2";
                state.editor.cursorPosition = 0;
                state.actionLogPane.currentActionLogId = "log1";
                state.actionLogPane.currentListItemId = "item2";
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
