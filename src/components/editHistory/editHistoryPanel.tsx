import type { HistoryOperation } from "@/services/firebase/firestore/editHistory/schema";
import type { Schema } from "@/services/firebase/firestore/schema";

import { query } from "firebase/firestore";
import { createMemo, For, Show } from "solid-js";

import { useActionsService } from "@/services/actions";
import { type DocumentData, getCollection, useFirestoreService } from "@/services/firebase/firestore";
import "@/services/firebase/firestore/editHistory/schema";
import { createSubscribeAllSignal } from "@/services/firebase/firestore/subscribe";
import { useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { styles } from "@/styles.css";

type HistoryEntry = DocumentData<Schema["editHistory"]>;

function formatTimestamp(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return "";
  const date = ts.toDate();
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatUuidv7Timestamp(id: string): string {
  const ms = parseInt(id.replace(/-/g, "").slice(0, 12), 16);
  const date = new Date(ms);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value.length > 20 ? value.slice(0, 20) + "..." : value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return formatTimestamp(value as { toDate: () => Date });
  }
  return JSON.stringify(value);
}

// --- Graph model ---

export interface GraphRow {
  entry?: HistoryEntry;
  isHead: boolean;
  isRoot: boolean;
  prefix: string;
}

export function buildGraphRows(entries: Map<string, HistoryEntry>, headId: string): GraphRow[] {
  if (entries.size === 0) return [];

  // Build children map
  const childrenByParent = new Map<string, HistoryEntry[]>();
  for (const entry of entries.values()) {
    const list = childrenByParent.get(entry.parentId) ?? [];
    list.push(entry);
    childrenByParent.set(entry.parentId, list);
  }

  // Sort children of each parent by ID desc (newest first)
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => b.id.localeCompare(a.id));
  }

  // Find the newest entry (largest uuidv7)
  let newest: HistoryEntry | undefined;
  for (const entry of entries.values()) {
    if (!newest || entry.id.localeCompare(newest.id) > 0) {
      newest = entry;
    }
  }
  if (!newest) return [];

  // Walk from newest to root to get main line
  const mainLine: HistoryEntry[] = [];
  let currentId: string = newest.id;
  while (currentId !== "") {
    const entry = entries.get(currentId);
    if (!entry) break;
    mainLine.push(entry);
    currentId = entry.parentId;
  }
  const mainLineIds = new Set(mainLine.map((e) => e.id));

  const rows: GraphRow[] = [];

  // Emit a subtree as a branch column. Walks down: newest child = main of this branch,
  // others = sub-branches (deeper |).
  function emitSubtree(start: HistoryEntry, depth: number): void {
    const prefix = "| ".repeat(depth);

    // Follow newest child at each step to build the chain
    const chain: HistoryEntry[] = [start];
    let current = start;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const children = childrenByParent.get(current.id) ?? [];
      if (children.length === 0) break;
      chain.push(children[0]);
      current = children[0];
    }

    // Emit newest first
    for (let c = chain.length - 1; c >= 0; c--) {
      const chainEntry = chain[c];
      const children = childrenByParent.get(chainEntry.id) ?? [];
      // Sub-branches of this chain entry (children 1..N)
      for (let s = 1; s < children.length; s++) {
        emitSubtree(children[s], depth + 1);
        rows.push({ entry: undefined, isHead: false, isRoot: false, prefix: `${prefix}| |/  ` });
      }
      rows.push({
        entry: chainEntry,
        isHead: chainEntry.id === headId,
        isRoot: false,
        prefix: `${prefix}| * `,
      });
    }
  }

  // Root-level siblings: entries with the same parentId as mainLine's last entry
  // that are NOT on the mainLine. These appear as branches of the "virtual root".
  const lastMainLineEntry = mainLine[mainLine.length - 1];
  const rootParentId = lastMainLineEntry.parentId;
  const rootSiblings = [...entries.values()]
    .filter((e) => e.parentId === rootParentId && !mainLineIds.has(e.id))
    .sort((a, b) => b.id.localeCompare(a.id));

  // Iterate main line newest → oldest
  for (let i = 0; i < mainLine.length; i++) {
    const entry = mainLine[i];
    const isHead = entry.id === headId;
    const isLastInMain = i === mainLine.length - 1;
    // No entry is root — the virtual root node at the bottom is the only root
    const isRoot = false;

    // Non-mainLine children of this entry (shown as branches ABOVE entry)
    const children = childrenByParent.get(entry.id) ?? [];
    const branches = children.filter((c) => !mainLineIds.has(c.id));

    for (const branchEntry of branches) {
      emitSubtree(branchEntry, 0);
      rows.push({ entry: undefined, isHead: false, isRoot: false, prefix: "|/  " });
    }

    // If this is the last main-line entry, show root-level siblings as branches above it
    if (isLastInMain && rootSiblings.length > 0) {
      for (const sibling of rootSiblings) {
        emitSubtree(sibling, 0);
        rows.push({ entry: undefined, isHead: false, isRoot: false, prefix: "|/  " });
      }
    }

    rows.push({ entry, isHead, isRoot, prefix: "* " });
  }

  // Add virtual root node at the bottom (represents HEAD="" state)
  rows.push({ entry: undefined, isHead: headId === "", isRoot: true, prefix: "* " });

  return rows;
}

// --- Components ---

export function findInverseOp(
  entry: HistoryEntry,
  fwdOp: HistoryOperation,
  fwdIndex: number,
): HistoryOperation | undefined {
  const invIndex = entry.inverseOperations.length - 1 - fwdIndex;
  if (invIndex < 0 || invIndex >= entry.inverseOperations.length) return undefined;
  const candidate = entry.inverseOperations[invIndex];
  if (candidate.collection === fwdOp.collection && candidate.id === fwdOp.id) {
    return candidate;
  }
  return undefined;
}

function OperationDetail(props: { entry: HistoryEntry; op: HistoryOperation; index: number }) {
  const inverseOp = () => findInverseOp(props.entry, props.op, props.index);

  return (
    <div class={styles.editHistory.graphDetailLine}>
      <span class={styles.editHistory.graphCollection}>{props.op.collection}</span>
      <Show when={props.op.type === "set"}>
        <span>新規</span>
      </Show>
      <Show when={props.op.type === "delete"}>
        <span>削除</span>
      </Show>
      <Show when={props.op.type === "update" && "data" in props.op}>
        <For each={Object.keys("data" in props.op ? props.op.data : {})}>
          {(field) => {
            const inv = inverseOp();
            const oldVal = inv && "data" in inv ? (inv.data as Record<string, unknown>)[field] : undefined;
            const newVal = "data" in props.op ? (props.op.data as Record<string, unknown>)[field] : undefined;
            return (
              <span>
                {field}: <span class={styles.editHistory.graphOldValue}>{formatValue(oldVal)}</span> →{" "}
                <span class={styles.editHistory.graphNewValue}>{formatValue(newVal)}</span>
              </span>
            );
          }}
        </For>
      </Show>
    </div>
  );
}

// Continuation prefix: replace `*` with `|` so the line continues through
// the commit marker on detail lines. For root entries, replace `*` with space
// since no line continues below.
export function continuationPrefix(prefix: string, isRoot: boolean): string {
  const replaced = prefix.replace(/\*/g, isRoot ? " " : "|").replace(/\//g, " ");
  return replaced;
}

function GraphRowView(props: { row: GraphRow; currentHeadId: string; onJump: (id: string) => void }) {
  const isActive = () => {
    if (props.row.entry) return props.row.entry.id === props.currentHeadId;
    // Virtual root node: active when HEAD is ""
    return props.row.isRoot && props.currentHeadId === "";
  };
  const contPrefix = () => continuationPrefix(props.row.prefix, props.row.isRoot);

  return (
    <div
      class={`${styles.editHistory.graphRow} ${isActive() ? styles.editHistory.graphRowActive : ""}`}
      onClick={() => {
        if (props.row.entry) props.onJump(props.row.entry.id);
      }}
    >
      <Show when={props.row.entry}>
        {(entry) => (
          <div class={styles.editHistory.graphContent}>
            <div class={styles.editHistory.graphLine}>
              <span class={styles.editHistory.graphPrefix}>{props.row.prefix}</span>
              <span class={styles.editHistory.graphDescription}>{entry().description || "操作"}</span>
              <span class={styles.editHistory.graphTimestamp}>{formatUuidv7Timestamp(entry().id)}</span>
              <Show when={props.row.isHead}>
                <span class={styles.editHistory.graphHead}>HEAD</span>
              </Show>
            </div>
            <Show when={entry().operations.length > 0}>
              <For each={entry().operations}>
                {(op, i) => (
                  <div class={styles.editHistory.graphLine}>
                    <span class={styles.editHistory.graphPrefix}>{contPrefix()}</span>
                    <div class={styles.editHistory.graphDetails}>
                      <OperationDetail entry={entry()} op={op} index={i()} />
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        )}
      </Show>
      <Show when={!props.row.entry && props.row.isRoot}>
        <div class={styles.editHistory.graphContent}>
          <div class={styles.editHistory.graphLine}>
            <span class={styles.editHistory.graphPrefix}>{props.row.prefix}</span>
            <span class={styles.editHistory.graphDescription}>初期状態</span>
            <Show when={props.row.isHead}>
              <span class={styles.editHistory.graphHead}>HEAD</span>
            </Show>
          </div>
        </div>
      </Show>
      <Show when={!props.row.entry && !props.row.isRoot}>
        <span class={styles.editHistory.graphPrefix}>{props.row.prefix}</span>
      </Show>
    </div>
  );
}

export function EditHistoryPanel() {
  const firestore = useFirestoreService();
  const { state } = useStoreService();
  const {
    components: { editHistory: editHistoryActions },
  } = useActionsService();

  const editHistoryCol = getCollection(firestore, "editHistory");

  const currentHeadId = () => firestore.editHistoryHead$()?.entryId ?? "";

  const entries$ = createSubscribeAllSignal(firestore, () => query(editHistoryCol));

  const graphRows = createMemo(() => {
    const entries = entries$();
    if (entries.length === 0) return [];
    const map = new Map<string, HistoryEntry>();
    for (const entry of entries) {
      map.set(entry.id, entry);
    }
    return buildGraphRows(map, currentHeadId());
  });

  addKeyDownEventListener((event) => {
    if (!state.editHistory.isPanelOpen) return;
    if (event.code === "Escape") {
      event.preventDefault();
      editHistoryActions.closePanel();
    }
  });

  return (
    <div class={styles.editHistory.panel}>
      <div class={styles.editHistory.panelHeader}>
        <span>編集履歴</span>
        <button
          class={styles.editHistory.closeButton}
          onClick={() => {
            editHistoryActions.closePanel();
          }}
        >
          ✕
        </button>
      </div>
      <div class={styles.editHistory.treeContainer}>
        <For each={graphRows()}>
          {(row) => (
            <GraphRowView
              row={row}
              currentHeadId={currentHeadId()}
              onJump={(id) => {
                editHistoryActions.jumpToNode(id);
              }}
            />
          )}
        </For>
      </div>
    </div>
  );
}
