import userEvent from "@testing-library/user-event";
import { Match, Switch } from "solid-js";
import { registerSW } from "virtual:pwa-register";

import { ActionLogListPane } from "@/components/actionLogListPane";
import { ActionLogPane } from "@/components/actionLogPane";
import { RxdbFirestoreSyncConfig } from "@/components/rxdbFirestoreSyncConfig";
import { createSignalWithLock, useLockService, waitLockRelease } from "@/services/lock";
import { useStoreService } from "@/services/store";
import { renderWithServicesForTest } from "@/services/test";
import { styles } from "@/styles.css";
import { shortenClassName } from "@/test";

registerSW({ immediate: true });

export function Main() {
  const { state } = useStoreService();
  const lock = useLockService();

  const currentPane$ = createSignalWithLock(lock, () => state.currentPane, "");

  return (
    <div class={styles.main}>
      <RxdbFirestoreSyncConfig />
      <Switch>
        <Match when={currentPane$() == "actionLog"}>
          <ActionLogPane />
        </Match>
        <Match when={currentPane$() === "actionLogList"}>
          <ActionLogListPane />
        </Match>
      </Switch>
    </div>
  );
}

if (import.meta.vitest) {
  describe("PC operations", () => {
    describe("keyboard operations", () => {
      test("in ActionLogPane, press h to move to ActionLogListPane", async (test) => {
        const user = userEvent.setup();
        const { container, unmount, lock } = await renderWithServicesForTest(
          test.meta.id,
          (props) => (
            <>
              <Main />
              {props.children}
            </>
          ),
          async ({ rxdb: { collections }, store: { updateState } }) => {
            // prettier-ignore
            await collections.actionLogs.bulkInsert([
              { id: "log1", text: "log1", startAt: 1000, endAt: 0, updatedAt: 0 },
              { id: "log2", text: "log2", startAt: 2000, endAt: 0, updatedAt: 0 },
            ]);
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
              state.actionLogListPane.currentActionLogId = "log1";
            });
          }
        );

        await user.keyboard("h");
        await waitLockRelease(lock);

        test.expect(shortenClassName(container)).toMatchSnapshot("after press h");

        unmount();
      });

      test("in ActionLogPane, press Backspace to remove empty item and move to ActionLogListPane", async (test) => {
        const user = userEvent.setup();
        const { container, unmount, lock, getByDisplayValue } = await renderWithServicesForTest(
          test.meta.id,
          (props) => (
            <>
              <Main />
              {props.children}
            </>
          ),
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
              text: "",
              parentId: "log1",
              prevId: "",
              nextId: "",
              updatedAt: 0,
            });

            updateState((state) => {
              state.currentPane = "actionLog";
              state.mode = "insert";
              state.editor.text = "";
              state.editor.cursorPosition = 0;
              state.actionLogPane.currentActionLogId = "log1";
              state.actionLogPane.currentListItemId = "item1";
              state.actionLogListPane.currentActionLogId = "log1";
            });
          }
        );

        await user.keyboard("{Backspace}");
        await waitLockRelease(lock);

        const input = getByDisplayValue<HTMLInputElement>("log1");

        test.expect(shortenClassName(container)).toMatchSnapshot("after press Backspace");
        test.expect(input.selectionStart).toBe(4);
        test.expect(input.selectionEnd).toBe(4);

        unmount();
      });
    });
  });
}
