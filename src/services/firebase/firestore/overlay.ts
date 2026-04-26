import { Timestamp } from "firebase/firestore";
import { type Accessor, createSignal } from "solid-js";

import { type OrderByConstraint, type WhereConstraint } from "@/services/firebase/firestore/query";
import { type Schema } from "@/services/firebase/firestore/schema";

export type OverlayStatus = "pending" | "committed" | "failed";

export type OverlayMutation =
  | {
      type: "set";
      batchId: string;
      collection: keyof Schema;
      id: string;
      path: string;
      data: Record<string, unknown>;
    }
  | {
      type: "update";
      batchId: string;
      collection: keyof Schema;
      id: string;
      path: string;
      data: Record<string, unknown>;
    }
  | {
      type: "delete";
      batchId: string;
      collection: keyof Schema;
      id: string;
      path: string;
    };

export type OverlayBatch = {
  id: string;
  status: OverlayStatus;
  mutations: OverlayMutation[];
  error?: unknown;
};

export type QueryMetadata = {
  collection: keyof Schema;
  filters: WhereConstraint[];
  orderBys: OrderByConstraint[];
  limit?: number;
  hasUntrackedConstraints?: boolean;
};

export type OptimisticOverlay = {
  version$: Accessor<number>;
  apply: (batchId: string, mutations: OverlayMutation[]) => void;
  markCommitted: (batchId: string) => void;
  rollback: (batchId: string, error: unknown) => void;
  acknowledgeDocument: (path: string, serverData: object | undefined) => void;
  mergeDocument: <T extends object>(
    collection: keyof Schema,
    id: string,
    snapshotData: (T & { id: string }) | undefined,
    options?: { excludeBatchId?: string },
  ) => (T & { id: string }) | undefined;
  mergeQuery: <T extends object>(
    snapshotData: (T & { id: string })[],
    metadata: QueryMetadata,
  ) => (T & { id: string })[];
};

const ignoredFieldsForCatchUp = new Set(["createdAt", "updatedAt"]);

type DocumentOverlayResult =
  | { kind: "set"; data: Record<string, unknown> }
  | { kind: "update"; data: Record<string, unknown> }
  | { kind: "delete" }
  | { kind: "none" };

function composeMutationsForDocument(mutations: OverlayMutation[]): DocumentOverlayResult {
  let result: DocumentOverlayResult = { kind: "none" };

  for (const m of mutations) {
    if (m.type === "set") {
      const data = materializeSetData(m.data);
      result = { kind: "set", data };
    } else if (m.type === "update") {
      const incoming: Record<string, unknown> = m.data;
      if (result.kind === "set") {
        const base: Record<string, unknown> = result.data;
        result = { kind: "set", data: applyUpdateData(base, incoming) };
      } else if (result.kind === "update") {
        const base: Record<string, unknown> = result.data;
        result = { kind: "update", data: applyUpdateData(base, incoming) };
      } else if (result.kind === "delete") {
        // delete -> update: ignore (no base to merge into)
      } else {
        result = { kind: "update", data: { ...incoming } };
      }
    } else {
      result = { kind: "delete" };
    }
  }

  return result;
}

function getMutationsForDocument(
  batches: OverlayBatch[],
  path: string,
  options?: { excludeBatchId?: string },
): OverlayMutation[] {
  const mutations: OverlayMutation[] = [];
  for (const batch of batches) {
    if (options?.excludeBatchId !== undefined && batch.id === options.excludeBatchId) continue;
    for (const mutation of batch.mutations) {
      if (mutation.path === path) {
        mutations.push(mutation);
      }
    }
  }
  return mutations;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a instanceof Timestamp && b instanceof Timestamp) {
    return a.valueOf() === b.valueOf();
  }
  if (a === null || b === null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!valuesEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

function getFieldValue(
  data: Record<string, unknown> | undefined,
  fieldPath: string,
  id?: string,
): unknown {
  if (data === undefined) return undefined;
  if (fieldPath === "__name__") return id;
  if (!fieldPath.includes(".")) {
    return data[fieldPath];
  }
  const parts = fieldPath.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function applyUpdateData(
  base: Record<string, unknown>,
  update: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };

  for (const [fieldPath, value] of Object.entries(update)) {
    if (!fieldPath.includes(".")) {
      applyFieldValue(result, fieldPath, value);
      continue;
    }

    const parts = fieldPath.split(".");
    let current: Record<string, unknown> = result;
    for (const part of parts.slice(0, -1)) {
      const existing = current[part];
      const next =
        existing !== null && typeof existing === "object" && !Array.isArray(existing)
          ? { ...(existing as Record<string, unknown>) }
          : {};
      current[part] = next;
      current = next;
    }
    applyFieldValue(current, parts[parts.length - 1], value);
  }

  return result;
}

function isFirestoreSentinel(value: unknown, methodName: string): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { _methodName?: unknown })._methodName === methodName
  );
}

function applyFieldValue(target: Record<string, unknown>, key: string, value: unknown): void {
  if (isFirestoreSentinel(value, "deleteField")) {
    Reflect.deleteProperty(target, key);
    return;
  }

  if (isFirestoreSentinel(value, "increment")) {
    const operand =
      (value as { _operand?: unknown })._operand ??
      Object.values(value as Record<string, unknown>).find((candidate) => typeof candidate === "number");
    const current = target[key];
    target[key] =
      typeof current === "number" && typeof operand === "number"
        ? current + operand
        : operand;
    return;
  }

  if (isFirestoreSentinel(value, "serverTimestamp")) {
    target[key] = Timestamp.now();
    return;
  }

  target[key] = value;
}

function materializeSetData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [fieldPath, value] of Object.entries(data)) {
    if (!fieldPath.includes(".")) {
      if (!isFirestoreSentinel(value, "deleteField")) {
        applyFieldValue(result, fieldPath, value);
      }
      continue;
    }

    const parts = fieldPath.split(".");
    let current = result;
    for (const part of parts.slice(0, -1)) {
      const existing = current[part];
      const next =
        existing !== null && typeof existing === "object" && !Array.isArray(existing)
          ? { ...(existing as Record<string, unknown>) }
          : {};
      current[part] = next;
      current = next;
    }
    if (!isFirestoreSentinel(value, "deleteField")) {
      applyFieldValue(current, parts[parts.length - 1], value);
    }
  }
  return result;
}

function stripIdField(doc: object & { id: string }): Record<string, unknown> {
  const { id: _id, ...rest } = doc as Record<string, unknown> & { id: string };
  return rest;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;

  if (a instanceof Timestamp && b instanceof Timestamp) {
    const av = a.valueOf();
    const bv = b.valueOf();
    return av < bv ? -1 : av > bv ? 1 : 0;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === "string" && typeof b === "string") {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    return a === b ? 0 : a ? 1 : -1;
  }
  return 0;
}

const supportedOps = new Set(["==", "<", "<=", ">", ">="]);

const warnedUnsupportedOps = new Set<string>();

function evaluateFilter(data: Record<string, unknown>, filter: WhereConstraint, id?: string): boolean {
  const fieldValue = getFieldValue(data, filter.fieldPath, id);

  if (fieldValue === undefined) return false;

  switch (filter.op) {
    case "==":
      return valuesEqual(fieldValue, filter.value);
    case "<":
      return compareValues(fieldValue, filter.value) < 0;
    case "<=":
      return compareValues(fieldValue, filter.value) <= 0;
    case ">":
      return compareValues(fieldValue, filter.value) > 0;
    case ">=":
      return compareValues(fieldValue, filter.value) >= 0;
    default:
      return false;
  }
}

function hasUnsupportedFilter(metadata: QueryMetadata): boolean {
  for (const filter of metadata.filters) {
    if (!supportedOps.has(filter.op)) {
      const key = `${filter.fieldPath}:${filter.op}`;
      if (!warnedUnsupportedOps.has(key)) {
        warnedUnsupportedOps.add(key);
        console.warn(
          `[overlay] unsupported filter op "${filter.op}" on field "${filter.fieldPath}". ` +
            `Optimistic overlay will not be applied to this query; server snapshot returned as-is.`,
        );
      }
      return true;
    }
  }
  return false;
}

function matchesQuery(data: Record<string, unknown>, metadata: QueryMetadata, id?: string): boolean {
  for (const filter of metadata.filters) {
    if (!evaluateFilter(data, filter, id)) return false;
  }
  for (const orderBy of metadata.orderBys) {
    if (getFieldValue(data, orderBy.fieldPath, id) === undefined) return false;
  }
  return true;
}

function compareForOrder(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  aId: string,
  bId: string,
  orderBys: OrderByConstraint[],
): number {
  for (const ob of orderBys) {
    const av = getFieldValue(a, ob.fieldPath, aId);
    const bv = getFieldValue(b, ob.fieldPath, bId);
    const cmp = compareValues(av, bv);
    if (cmp !== 0) {
      return ob.direction === "desc" ? -cmp : cmp;
    }
  }
  const idCmp = aId < bId ? -1 : aId > bId ? 1 : 0;
  return orderBys.at(-1)?.direction === "desc" ? -idCmp : idCmp;
}

function stripIgnoredFields(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (!ignoredFieldsForCatchUp.has(key)) {
      result[key] = data[key];
    }
  }
  return result;
}

function composedMutationsCaughtUp(
  mutations: OverlayMutation[],
  serverData: Record<string, unknown> | undefined,
): boolean {
  const composed = composeMutationsForDocument(mutations);

  if (composed.kind === "none") return true;
  if (composed.kind === "delete") return serverData === undefined;
  if (serverData === undefined) return false;

  const expectedStripped = stripIgnoredFields(composed.data);
  const serverStripped = stripIgnoredFields(serverData);

  for (const [fieldPath, expectedValue] of Object.entries(expectedStripped)) {
    if (!valuesEqual(getFieldValue(serverStripped, fieldPath), expectedValue)) {
      return false;
    }
  }

  return true;
}

export function createOptimisticOverlay(): OptimisticOverlay {
  const [version$, setVersion] = createSignal(0);
  const batches: OverlayBatch[] = [];
  // Track latest server-confirmed (non-pending) snapshot per document path so
  // that when markCommitted fires after the matching snapshot has already been
  // received, we can still drop the overlay entry.
  const latestServerByPath = new Map<string, Record<string, unknown> | undefined>();
  const latestKnownByPath = new Map<string, Record<string, unknown> | undefined>();
  const ackedPaths = new Set<string>();

  function bumpVersion() {
    setVersion((v) => v + 1);
  }

  function findBatchIndex(batchId: string): number {
    for (let i = 0; i < batches.length; i++) {
      if (batches[i].id === batchId) return i;
    }
    return -1;
  }

  function getMutationsForDocumentOnly(path: string, options?: { excludeBatchId?: string }): OverlayMutation[] {
    return getMutationsForDocument(batches, path, options);
  }

  function getCommittedMutationsForDocument(path: string): OverlayMutation[] {
    const mutations: OverlayMutation[] = [];
    for (const batch of batches) {
      if (batch.status !== "committed") continue;
      for (const mutation of batch.mutations) {
        if (mutation.path === path) {
          mutations.push(mutation);
        }
      }
    }
    return mutations;
  }

  function recomputeLatestKnownForPath(path: string): void {
    const mutations = getMutationsForDocumentOnly(path);
    let known = latestServerByPath.get(path);
    let hasKnown = latestServerByPath.has(path);

    for (const mutation of mutations) {
      if (mutation.type === "set") {
        known = materializeSetData(mutation.data);
        hasKnown = true;
      } else if (mutation.type === "update") {
        if (hasKnown && known !== undefined) {
          known = applyUpdateData(known, mutation.data);
        }
      } else {
        known = undefined;
        hasKnown = true;
      }
    }

    if (hasKnown || mutations.length > 0) {
      latestKnownByPath.set(path, known);
    } else {
      latestKnownByPath.delete(path);
    }
  }

  function mutationsAreAllCommitted(mutations: OverlayMutation[]): boolean {
    return mutations.every((mutation) => {
      const batch = batches.find((b) => b.id === mutation.batchId);
      return batch?.status === "committed";
    });
  }

  function removeCommittedMutationsForDocument(path: string): boolean {
    let changed = false;
    for (let i = batches.length - 1; i >= 0; i--) {
      const batch = batches[i];
      if (batch.status !== "committed") continue;

      const remaining = batch.mutations.filter((mutation) => mutation.path !== path);
      if (remaining.length === batch.mutations.length) continue;

      changed = true;
      if (remaining.length === 0) {
        batches.splice(i, 1);
      } else {
        batch.mutations = remaining;
      }
    }
    return changed;
  }

  function tryCatchUpPath(path: string): boolean {
    if (!ackedPaths.has(path)) return false;
    const serverRecord = latestServerByPath.get(path);
    const committedMutations = getCommittedMutationsForDocument(path);
    if (committedMutations.length === 0) return false;
    if (!composedMutationsCaughtUp(committedMutations, serverRecord)) return false;

    return removeCommittedMutationsForDocument(path);
  }

  return {
    version$,
    apply(batchId, mutations) {
      if (mutations.length === 0) return;
      const stamped = mutations.map((m) => ({ ...m, batchId }) as OverlayMutation);
      const existingIndex = findBatchIndex(batchId);
      if (existingIndex >= 0) {
        batches[existingIndex].mutations.push(...stamped);
      } else {
        batches.push({ id: batchId, status: "pending", mutations: stamped });
      }
      for (const mutation of stamped) {
        if (mutation.type === "set") {
          latestKnownByPath.set(mutation.path, materializeSetData(mutation.data));
        } else if (mutation.type === "update") {
          const base = latestKnownByPath.get(mutation.path) ?? latestServerByPath.get(mutation.path);
          if (base) {
            latestKnownByPath.set(mutation.path, applyUpdateData(base, mutation.data));
          }
        } else {
          latestKnownByPath.set(mutation.path, undefined);
        }
      }
      bumpVersion();
    },

    markCommitted(batchId) {
      const idx = findBatchIndex(batchId);
      if (idx < 0) return;
      const batch = batches[idx];
      if (batch.status === "committed") return;
      batch.status = "committed";

      // Re-check against any snapshot we already received before this commit
      // landed. Without this, an overlay mutation whose matching snapshot
      // arrived before markCommitted fired would never be cleared.
      const paths = new Set<string>();
      for (const m of batch.mutations) paths.add(m.path);
      for (const path of paths) {
        tryCatchUpPath(path);
      }

      bumpVersion();
    },

    rollback(batchId, error) {
      const idx = findBatchIndex(batchId);
      if (idx < 0) return;
      const paths = new Set(batches[idx].mutations.map((mutation) => mutation.path));
      batches.splice(idx, 1);
      for (const path of paths) {
        recomputeLatestKnownForPath(path);
      }
      // Note: error currently only logged via console; UI hookup is out of scope.
      if (error !== undefined) {
        console.error("[overlay] rollback batch", batchId, error);
      }
      bumpVersion();
    },

    acknowledgeDocument(path, serverData) {
      const serverRecord = serverData as Record<string, unknown> | undefined;
      latestServerByPath.set(path, serverRecord);
      if (getMutationsForDocumentOnly(path).length === 0) {
        if (serverRecord !== undefined || latestKnownByPath.get(path) === undefined) {
          latestKnownByPath.set(path, serverRecord);
        }
      }
      ackedPaths.add(path);

      if (tryCatchUpPath(path)) {
        if (getMutationsForDocumentOnly(path).length === 0) {
          latestKnownByPath.set(path, serverRecord);
        }
        bumpVersion();
      }
    },

    mergeDocument<T extends object>(
      collection: keyof Schema,
      id: string,
      snapshotData: (T & { id: string }) | undefined,
      options?: { excludeBatchId?: string },
    ): (T & { id: string }) | undefined {
      const path = `${String(collection)}/${id}`;
      const mutations = getMutationsForDocumentOnly(path, options);
      if (mutations.length === 0) return snapshotData;

      const composed = composeMutationsForDocument(mutations);

      if (composed.kind === "delete") return undefined;
      if (composed.kind === "none") return snapshotData;

      if (composed.kind === "set") {
        return { ...composed.data, id } as T & { id: string };
      }

      // update
      const baseRecord = snapshotData ? stripIdField(snapshotData) : latestKnownByPath.get(path);
      if (!baseRecord) return undefined;
      return { ...applyUpdateData(baseRecord, composed.data), id } as T & { id: string };
    },

    mergeQuery<T extends object>(
      snapshotData: (T & { id: string })[],
      metadata: QueryMetadata,
    ): (T & { id: string })[] {
      if (metadata.hasUntrackedConstraints) {
        return snapshotData;
      }

      if (hasUnsupportedFilter(metadata)) {
        return snapshotData;
      }

      const byPath = new Map<string, T & { id: string }>();
      for (const doc of snapshotData) {
        byPath.set(`${String(metadata.collection)}/${doc.id}`, doc);
      }

      const overlayDocs = new Map<string, T & { id: string }>();
      const removed = new Set<string>();

      // Group mutations by path, restricted to this query's collection
      const mutationsByPath = new Map<string, OverlayMutation[]>();
      for (const batch of batches) {
        for (const mutation of batch.mutations) {
          if (mutation.collection !== metadata.collection) continue;
          const list = mutationsByPath.get(mutation.path) ?? [];
          list.push(mutation);
          mutationsByPath.set(mutation.path, list);
        }
      }

      if (metadata.filters.length === 0 && metadata.orderBys.length === 0 && metadata.limit === undefined) {
        for (let i = batches.length - 1; i >= 0; i--) {
          const batch = batches[i];
          if (batch.status !== "committed") continue;
          const remaining = batch.mutations.filter(
            (mutation) =>
              mutation.collection !== metadata.collection ||
              mutation.type !== "delete" ||
              byPath.has(mutation.path),
          );
          if (remaining.length === 0) {
            batches.splice(i, 1);
          } else {
            batch.mutations = remaining;
          }
        }
      }

      for (const [path, mutations] of mutationsByPath) {
        const composed = composeMutationsForDocument(mutations);
        const id = path.slice(String(metadata.collection).length + 1);
        const baseDoc = byPath.get(path);
        const baseRecord = baseDoc ? stripIdField(baseDoc) : latestKnownByPath.get(path);

        if (composed.kind === "delete") {
          if (baseDoc && mutationsAreAllCommitted(mutations)) {
            removeCommittedMutationsForDocument(path);
            continue;
          }
          removed.add(path);
          continue;
        }

        if (composed.kind === "set") {
          if (matchesQuery(composed.data, metadata, id)) {
            overlayDocs.set(path, { ...composed.data, id } as T & { id: string });
          } else {
            if (mutationsAreAllCommitted(mutations)) {
              removeCommittedMutationsForDocument(path);
            }
            removed.add(path);
          }
          continue;
        }

        if (composed.kind === "update") {
          if (!baseRecord) {
            // No base — overlay can't materialize a doc from update alone.
            continue;
          }
          const merged = applyUpdateData(baseRecord, composed.data);
          if (matchesQuery(merged, metadata, id)) {
            overlayDocs.set(path, { ...merged, id } as T & { id: string });
          } else {
            if (mutationsAreAllCommitted(mutations)) {
              removeCommittedMutationsForDocument(path);
            }
            removed.add(path);
          }
          continue;
        }
      }

      const result: (T & { id: string })[] = [];
      for (const doc of snapshotData) {
        const path = `${String(metadata.collection)}/${doc.id}`;
        if (removed.has(path)) continue;
        const overlaid = overlayDocs.get(path);
        if (overlaid !== undefined) {
          result.push(overlaid);
          overlayDocs.delete(path);
        } else {
          result.push(doc);
        }
      }
      for (const doc of overlayDocs.values()) {
        result.push(doc);
      }

      result.sort((a, b) =>
        compareForOrder(stripIdField(a), stripIdField(b), a.id, b.id, metadata.orderBys),
      );

      return metadata.limit === undefined ? result : result.slice(0, metadata.limit);
    },
  };
}
