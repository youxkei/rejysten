import type { ActionLogDocument } from "@/services/rxdb/collections/actionLog";

import { For } from "solid-js";

import { useRxDBService } from "@/services/rxdb";
import { createSubscribeAllSignal } from "@/services/rxdb/subscribe";

export function ActionLogList() {
  const { collections } = useRxDBService();

  const actionLogs$ = createSubscribeAllSignal(() =>
    collections.actionLogs.find({
      selector: { beginAt: { $gt: 0 } },
      sort: [{ beginAt: "asc" }],
    })
  );

  const tentativeActionLogs$ = createSubscribeAllSignal(() => collections.actionLogs.find({ selector: { beginAt: 0 } }));

  return (
    <>
      <For each={actionLogs$()}>{(actionLog) => <ActionLog actionLog={actionLog} />}</For>
      <For each={tentativeActionLogs$()}>{(actionLog) => <ActionLog actionLog={actionLog} />}</For>
    </>
  );
}

function ActionLog(props: { actionLog: ActionLogDocument }) {
  return (
    <div>
      <span>{props.actionLog.beginAt}</span>
      <span>→</span>
      <span>{props.actionLog.endAt}</span>
      <span>：</span>
      <span>{props.actionLog.text}</span>
    </div>
  );
}
