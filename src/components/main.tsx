import userEvent from "@testing-library/user-event";
import { Match, Switch } from "solid-js";

import { ActionLogListPane } from "@/components/actionLogListPane";
import { ActionLogPane } from "@/components/actionLogPane";
import { createSignalWithLock, useLockService } from "@/services/lock";
import { useStoreService } from "@/services/store";
import { renderWithServicesForTest } from "@/services/test";
import { shortenClassName } from "@/test";
import { RxdbFirestoreSyncConfig } from "./rxdbFirestoreSyncConfig";

export function Main() {
  const { store } = useStoreService();
  const lock = useLockService();

  const currentPane$ = createSignalWithLock(lock, () => store.currentPane, "");

  return (
    <>
      <RxdbFirestoreSyncConfig />
      <Switch>
        <Match when={currentPane$() == "actionLog"}>
          <ActionLogPane />
        </Match>
        <Match when={currentPane$() === "actionLogList"}>
          <ActionLogListPane />
        </Match>
      </Switch>
    </>
  );
}

if (import.meta.vitest) {
  describe("PC operations", () => {
    describe("keyboard operations", () => {
      test("in ActionLogPane, press h to move to ActionLogListPane", async (test) => {
        const user = userEvent.setup();
        const { container, unmount, findByText } = await renderWithServicesForTest(
          test.meta.id,
          (props) => (
            <>
              <Main />
              {props.children}
            </>
          ),
          async ({ rxdb: { collections }, store: { updateStore } }) => {
            await collections.actionLogs.bulkInsert([
              { id: "log1", text: "log1", startAt: 1000, endAt: 0, updatedAt: 0 },
              { id: "log2", text: "log2", startAt: 2000, endAt: 0, updatedAt: 0 },
            ]);
            await collections.listItems.insert({ id: "item1", text: "item1", parentId: "log1", prevId: "", nextId: "", updatedAt: 0 });

            await updateStore((store) => {
              store.currentPane = "actionLog";
              store.actionLogPane.currentActionLogId = "log1";
              store.actionLogPane.currentListItemId = "item1";
              store.actionLogListPane.currentActionLogId = "log1";
            });
          }
        );

        test.expect(shortenClassName(container)).toMatchSnapshot("initial");

        await user.keyboard("h");
        await findByText("log2");

        test.expect(shortenClassName(container)).toMatchSnapshot("after press h");

        unmount();
      });
    });
  });
}
