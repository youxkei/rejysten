import { uuidv7 } from "uuidv7";

import {
  assembleContractWrites,
  isSentinel,
  latestEndAt,
  normalizeLifeLogOldValue,
  openEntry,
  type OpDeps,
  readContractState,
  secondFloorDate,
  sentinelDate,
} from "./shared";
import { batchGet, runInTransaction } from "../rest/transaction";
import { decodeFields } from "../rest/value";
import { documentName, setRawFields, type Write } from "../rest/write";
import { type WriteOp } from "../types";

export type SwitchResult =
  | { ok: true; id: string; stoppedId: string | null }
  | { ok: false; reason: "source not found" };

// Switch = stop the open entry (if any) and start a new one carrying an existing
// entry's text — one commit / one editHistory entry with two forward ops. The
// new entry's ngram is copied verbatim from the source (no recompute), so this
// stays Intl.Segmenter-free.
export async function switchLifeLog(deps: OpDeps, args: { sourceId: string }): Promise<SwitchResult> {
  const newId = uuidv7();
  const nowSec = secondFloorDate(deps.now());

  return runInTransaction<SwitchResult>(deps, async (transaction) => {
    const state = await readContractState(deps, transaction);

    const sourceName = documentName(deps.projectId, "lifeLogs", args.sourceId);
    const sourceNgramName = documentName(deps.projectId, "ngrams", `${args.sourceId}lifeLogs`);
    const sources = await batchGet(deps, transaction, [sourceName, sourceNgramName]);

    const sourceFields = sources.get(sourceName);
    if (!sourceFields) return { writes: null, value: { ok: false, reason: "source not found" } };

    const sourceData = decodeFields(sourceFields);
    const chosenText = typeof sourceData.text === "string" ? sourceData.text : "";
    const sourceNgramFields = sources.get(sourceNgramName);

    const forwardOps: WriteOp[] = [];
    const oldValues = new Map<string, Record<string, unknown>>();
    let stoppedId: string | null = null;
    let startAtForNew: Date;

    const open = openEntry(state);
    if (open) {
      forwardOps.push({ type: "update", collection: "lifeLogs", id: open.id, data: { endAt: nowSec } });
      oldValues.set(`lifeLogs/${open.id}`, normalizeLifeLogOldValue(open.fields));
      startAtForNew = nowSec;
      stoppedId = open.id;
    } else {
      const latestEnd = state.latest ? latestEndAt(state.latest) : null;
      startAtForNew = latestEnd && !isSentinel(latestEnd) ? latestEnd : nowSec;
    }

    forwardOps.push({
      type: "set",
      collection: "lifeLogs",
      id: newId,
      data: { text: chosenText, hasTreeNodes: false, startAt: startAtForNew, endAt: sentinelDate() },
    });

    const extraWrites: Write[] = [];
    if (sourceNgramFields) {
      extraWrites.push(setRawFields(documentName(deps.projectId, "ngrams", `${newId}lifeLogs`), sourceNgramFields));
    }

    const writes = assembleContractWrites(deps, {
      forwardOps,
      oldValues,
      description: "切り替え",
      prevSelection: {},
      nextSelection: { lifeLogs: newId },
      headEntryId: state.headEntryId,
      currentVersion: state.currentVersion,
      extraWrites,
    });

    return { writes, value: { ok: true, id: newId, stoppedId } };
  });
}
