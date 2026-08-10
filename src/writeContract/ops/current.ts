import { isSentinel, LATEST_LIFELOG_QUERY, type OpDeps } from "./shared";
import { runQuery } from "../rest/transaction";
import { decodeFields } from "../rest/value";

export interface CurrentLifeLog {
  id: string;
  text: string;
  startAt: string;
}

export interface CurrentResult {
  ok: true;
  current: CurrentLifeLog | null;
}

// The entry in progress, or null when the timeline's newest entry is already
// closed. Reads only the latest entry rather than going through
// readContractState, which also fetches the batchVersion and editHistory head
// that only a write needs.
export async function readCurrentLifeLog(deps: OpDeps): Promise<CurrentResult> {
  const docs = await runQuery(deps, LATEST_LIFELOG_QUERY);
  if (docs.length === 0) return { ok: true, current: null };

  const doc = docs[0];
  const data = decodeFields(doc.fields);
  if (!isSentinel(data.endAt)) return { ok: true, current: null };

  return {
    ok: true,
    current: {
      id: doc.name.slice(doc.name.lastIndexOf("/") + 1),
      text: typeof data.text === "string" ? data.text : "",
      // ISO rather than a Date, so the watch reads the same shape the endpoint
      // returns without a JSON date convention of its own.
      startAt: data.startAt instanceof Date ? data.startAt.toISOString() : "",
    },
  };
}
