import { isSentinel, LATEST_LIFELOG_QUERY, type OpDeps } from "./shared";
import { runQuery } from "../rest/transaction";
import { decodeFields } from "../rest/value";

export interface SwitchCandidate {
  id: string;
  text: string;
}

export interface SwitchCandidatesResult {
  ok: true;
  candidates: SwitchCandidate[];
}

// Read-only list of past entries the watch can pick text from. Scans the most
// recent closed, non-empty entries, dedupes by exact text keeping the newest,
// and returns the first `take`. No transaction (single consistent read).
export async function listSwitchCandidates(
  deps: OpDeps,
  options: { scanLimit: number; take: number } = { scanLimit: 100, take: 20 },
): Promise<SwitchCandidatesResult> {
  const docs = await runQuery(deps, undefined, { ...LATEST_LIFELOG_QUERY, limit: options.scanLimit });

  const seen = new Set<string>();
  const candidates: SwitchCandidate[] = [];

  for (const doc of docs) {
    const data = decodeFields(doc.fields);
    const text = typeof data.text === "string" ? data.text : "";
    if (text === "") continue;
    if (isSentinel(data.endAt)) continue; // skip the open entry
    if (seen.has(text)) continue;
    seen.add(text);
    candidates.push({ id: doc.name.slice(doc.name.lastIndexOf("/") + 1), text });
    if (candidates.length >= options.take) break;
  }

  return { ok: true, candidates };
}
