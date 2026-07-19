import { uuidv7 } from "uuidv7";

import { nextBatchVersionWrite } from "../batchVersion";
import { buildHistoryEntry } from "../historyEntry";
import { deriveInverseOps } from "../inverseOps";
import { batchGet, runQuery, type StructuredQuery } from "../rest/transaction";
import { type FirestoreFields, type RestConfig } from "../rest/types";
import { decodeFields, encodeFields } from "../rest/value";
import { createWithTimestamps, documentName, updateWithTimestamp, writeOpToWrite, type Write } from "../rest/write";
import { type Selection, type WriteOp } from "../types";

// The unset-time sentinel, identical to the Web `noneTimestamp`
// (src/timestamp.ts). Stored startAt/endAt are second-granular by contract.
export const SENTINEL_ISO = "3000-12-31T23:59:59.000Z";
const SENTINEL_MS = Date.parse(SENTINEL_ISO);
export const SINGLETON_ID = "singleton";

export const LATEST_LIFELOG_QUERY: StructuredQuery = {
  from: [{ collectionId: "lifeLogs" }],
  orderBy: [
    { field: { fieldPath: "endAt" }, direction: "DESCENDING" },
    { field: { fieldPath: "startAt" }, direction: "DESCENDING" },
  ],
  limit: 1,
};

// The transport config plus the domain clock. `now` returns epoch ms; the HTTP
// handler passes `Date.now`, the diff gate passes the same fixed clock it uses
// for the Web path so stored timestamps line up.
export interface OpDeps extends RestConfig {
  now: () => number;
}

export function sentinelDate(): Date {
  return new Date(SENTINEL_ISO);
}

export function secondFloorDate(ms: number): Date {
  return new Date(Math.floor(ms / 1000) * 1000);
}

export function isSentinel(value: unknown): boolean {
  return value instanceof Date && value.getTime() === SENTINEL_MS;
}

function idFromName(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

export interface LatestLifeLog {
  id: string;
  data: Record<string, unknown>;
  fields: FirestoreFields;
}

export interface ContractState {
  currentVersion: string | undefined;
  headEntryId: string | null;
  latest: LatestLifeLog | null;
}

// Reads the three inputs every write needs (batchVersion for CAS chaining,
// editHistoryHead for the undo linked-list parent, and the latest lifeLog for
// entry chaining), all within the given transaction.
export async function readContractState(deps: OpDeps, transaction: string): Promise<ContractState> {
  const batchVersionName = documentName(deps.projectId, "batchVersion", SINGLETON_ID);
  const headName = documentName(deps.projectId, "editHistoryHead", SINGLETON_ID);

  const singletons = await batchGet(deps, transaction, [batchVersionName, headName]);
  const batchVersionFields = singletons.get(batchVersionName);
  const headFields = singletons.get(headName);

  const batchVersionData = batchVersionFields ? decodeFields(batchVersionFields) : undefined;
  const headData = headFields ? decodeFields(headFields) : undefined;

  const currentVersion = typeof batchVersionData?.version === "string" ? batchVersionData.version : undefined;
  const headEntryId = typeof headData?.entryId === "string" ? headData.entryId : null;

  const latestDocs = await runQuery(deps, transaction, LATEST_LIFELOG_QUERY);
  const latest: LatestLifeLog | null =
    latestDocs.length > 0
      ? { id: idFromName(latestDocs[0].name), data: decodeFields(latestDocs[0].fields), fields: latestDocs[0].fields }
      : null;

  return { currentVersion, headEntryId, latest };
}

export function latestEndAt(latest: LatestLifeLog): Date | null {
  return latest.data.endAt instanceof Date ? latest.data.endAt : null;
}

// The open (still-running) entry is the latest one whose endAt is the sentinel.
export function openEntry(state: ContractState): LatestLifeLog | null {
  return state.latest && isSentinel(latestEndAt(state.latest)) ? state.latest : null;
}

// Strips the id-less Firestore fields down to the business fields, dropping the
// server timestamps — the same normalization the Web batch applies before
// feeding old values to deriveInverseOps (batch.ts oldValues normalization).
export function normalizeLifeLogOldValue(fields: FirestoreFields): Record<string, unknown> {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = decodeFields(fields);
  return rest;
}

export interface ContractInputs {
  forwardOps: WriteOp[];
  oldValues: Map<string, Record<string, unknown>>;
  description: string;
  prevSelection: Selection;
  nextSelection: Selection;
  headEntryId: string | null;
  currentVersion: string | undefined;
  extraWrites?: Write[];
}

// Assembles one full commit exactly as the Web OperationRecordingBatch does:
// the business writes, then editHistory (with derived inverse ops), the
// editHistoryHead head pointer, and the batchVersion CAS write.
export function assembleContractWrites(deps: OpDeps, inputs: ContractInputs): Write[] {
  const { projectId } = deps;

  const inverseOperations = deriveInverseOps(inputs.forwardOps, inputs.oldValues);
  const historyEntryId = uuidv7();
  const historyEntry = buildHistoryEntry({
    parentId: inputs.headEntryId ?? "",
    description: inputs.description,
    operations: inputs.forwardOps,
    inverseOperations,
    prevSelection: inputs.prevSelection,
    nextSelection: inputs.nextSelection,
  });

  const writes: Write[] = [
    ...inputs.forwardOps.map((op) => writeOpToWrite(op, projectId)),
    ...(inputs.extraWrites ?? []),
    createWithTimestamps(documentName(projectId, "editHistory", historyEntryId), encodeFields(historyEntry)),
  ];

  const headName = documentName(projectId, "editHistoryHead", SINGLETON_ID);
  writes.push(
    inputs.headEntryId !== null
      ? updateWithTimestamp(headName, { entryId: { stringValue: historyEntryId } })
      : createWithTimestamps(headName, { entryId: { stringValue: historyEntryId } }),
  );

  const batchVersionWrite = nextBatchVersionWrite(inputs.currentVersion, uuidv7());
  const batchVersionName = documentName(projectId, "batchVersion", SINGLETON_ID);
  const batchVersionFields = {
    prevVersion: { stringValue: batchVersionWrite.data.prevVersion },
    version: { stringValue: batchVersionWrite.data.version },
  };
  writes.push(
    batchVersionWrite.op === "update"
      ? updateWithTimestamp(batchVersionName, batchVersionFields)
      : createWithTimestamps(batchVersionName, batchVersionFields),
  );

  return writes;
}
