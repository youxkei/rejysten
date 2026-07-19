import { runInTransaction } from "../rest/transaction";
import { type WriteOp } from "../types";
import {
  assembleContractWrites,
  normalizeLifeLogOldValue,
  openEntry,
  type OpDeps,
  readContractState,
  secondFloorDate,
} from "./shared";

export type StopResult = { ok: true; id: string } | { ok: false; reason: "no open entry" };

// Stops the open entry (setEndAtNow): update its endAt to `now`. Fails with
// "no open entry" when the latest entry is already closed or the timeline is
// empty. The inverse restores the sentinel endAt.
export async function stopLifeLog(deps: OpDeps): Promise<StopResult> {
  const nowSec = secondFloorDate(deps.now());

  return runInTransaction<StopResult>(deps, async (transaction) => {
    const state = await readContractState(deps, transaction);
    const open = openEntry(state);
    if (!open) return { writes: null, value: { ok: false, reason: "no open entry" } };

    const oldValues = new Map<string, Record<string, unknown>>([
      [`lifeLogs/${open.id}`, normalizeLifeLogOldValue(open.fields)],
    ]);
    const forwardOps: WriteOp[] = [{ type: "update", collection: "lifeLogs", id: open.id, data: { endAt: nowSec } }];

    const writes = assembleContractWrites(deps, {
      forwardOps,
      oldValues,
      description: "時刻設定",
      prevSelection: {},
      nextSelection: { lifeLogs: open.id },
      headEntryId: state.headEntryId,
      currentVersion: state.currentVersion,
    });

    return { writes, value: { ok: true, id: open.id } };
  });
}
