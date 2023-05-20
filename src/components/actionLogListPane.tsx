import type { ActionLogDocument } from "@/services/rxdb/collections/actionLog";

import { Temporal } from "@js-temporal/polyfill";
import { For } from "solid-js";

import { useRxDBService } from "@/services/rxdb";
import { createSubscribeAllSignal } from "@/services/rxdb/subscribe";

function epochMillisecondsToString(epochMilliseconds: number) {
  if (epochMilliseconds === 0) {
    return "N/A";
  }

  return Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).toZonedDateTimeISO("Asia/Tokyo").toPlainTime().toString({ smallestUnit: "second" });
}

export function ActionLogListPane() {
  const { collections } = useRxDBService();

  const actionLogs$ = createSubscribeAllSignal(() =>
    collections.actionLogs.find({
      selector: { beginAt: { $gt: 0 }, endAt: { $gt: 0 } },
      sort: [{ beginAt: "asc" }],
    })
  );

  const ongoingActionLogs$ = createSubscribeAllSignal(() =>
    collections.actionLogs.find({
      selector: { beginAt: { $gt: 0 }, endAt: 0 },
      sort: [{ beginAt: "asc" }],
    })
  );

  const tentativeActionLogs$ = createSubscribeAllSignal(() => collections.actionLogs.find({ selector: { beginAt: 0 } }));

  return (
    <>
      <For each={actionLogs$()}>{(actionLog) => <ActionLog actionLog={actionLog} />}</For>
      <For each={ongoingActionLogs$()}>{(actionLog) => <ActionLog actionLog={actionLog} />}</For>
      <For each={tentativeActionLogs$()}>{(actionLog) => <ActionLog actionLog={actionLog} />}</For>
    </>
  );
}

function ActionLog(props: { actionLog: ActionLogDocument }) {
  return (
    <div>
      <span>{epochMillisecondsToString(props.actionLog.beginAt)}</span>
      <span>～</span>
      <span>{epochMillisecondsToString(props.actionLog.endAt)}</span>
      <span>：</span>
      <span>{props.actionLog.text}</span>
    </div>
  );
}
