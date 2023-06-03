import { Match, Switch } from "solid-js";

import { ActionLogListPane } from "@/components/actionLogListPane";
import { ActionLogPane } from "@/components/actionLogPane";
import { createSignalWithLock, useLockService } from "@/services/lock";
import { useStoreService } from "@/services/store";

export function Pane() {
  const { store } = useStoreService();
  const lock = useLockService();

  const currentPane$ = createSignalWithLock(lock, () => store.currentPane, "");

  return (
    <Switch>
      <Match when={currentPane$() == "actionLog"}>
        <ActionLogPane />
      </Match>
      <Match when={currentPane$() === "actionLogList"}>
        <ActionLogListPane />
      </Match>
    </Switch>
  );
}
