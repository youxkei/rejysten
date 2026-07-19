import { uuidv7 } from "uuidv7";

import { runInTransaction } from "../rest/transaction";
import { type WriteOp } from "../types";
import {
  assembleContractWrites,
  isSentinel,
  latestEndAt,
  type OpDeps,
  readContractState,
  secondFloorDate,
  sentinelDate,
} from "./shared";

export interface StartResult {
  ok: true;
  id: string;
}

// Starts a new lifeLog (createFirstLifeLog / newLifeLog). Its startAt chains
// from the latest closed entry's endAt, or is `now` when the timeline is empty
// or still open; endAt is the sentinel and text is empty.
export async function startLifeLog(deps: OpDeps): Promise<StartResult> {
  const newId = uuidv7();
  const nowSec = secondFloorDate(deps.now());

  return runInTransaction(deps, async (transaction) => {
    const state = await readContractState(deps, transaction);

    const latestEnd = state.latest ? latestEndAt(state.latest) : null;
    const startAt = latestEnd && !isSentinel(latestEnd) ? latestEnd : nowSec;

    const forwardOps: WriteOp[] = [
      {
        type: "set",
        collection: "lifeLogs",
        id: newId,
        data: { text: "", hasTreeNodes: false, startAt, endAt: sentinelDate() },
      },
    ];

    const writes = assembleContractWrites(deps, {
      forwardOps,
      oldValues: new Map(),
      description: "LifeLog作成",
      prevSelection: {},
      nextSelection: { lifeLogs: newId },
      headEntryId: state.headEntryId,
      currentVersion: state.currentVersion,
    });

    return { writes, value: { ok: true, id: newId } };
  });
}
