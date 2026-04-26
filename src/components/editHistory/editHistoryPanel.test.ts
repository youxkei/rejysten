import type { DocumentData } from "@/services/firebase/firestore";
import type { Schema } from "@/services/firebase/firestore/schema";

import { Timestamp } from "firebase/firestore";
import { describe, it, expect } from "vitest";

import {
  buildGraphRows,
  buildKeyedGraphRows,
  continuationPrefix,
  findInverseOp,
} from "@/components/editHistory/editHistoryPanel";
import "@/services/firebase/firestore/editHistory/schema";

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    col: { text: string; createdAt: Timestamp; updatedAt: Timestamp };
  }
}

type HistoryEntry = DocumentData<Schema["editHistory"]>;

const ts = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));

/**
 * Create an entry with a given ID and parent. The ID order matters because
 * `buildGraphRows` uses `b.id.localeCompare(a.id)` to sort children (newest = largest ID).
 */
function entry(id: string, parentId: string, description: string): HistoryEntry {
  return {
    id,
    parentId,
    description,
    operations: [],
    inverseOperations: [],
    prevSelection: {},
    nextSelection: {},
    createdAt: ts,
    updatedAt: ts,
  };
}

function toMap(entries: HistoryEntry[]): Map<string, HistoryEntry> {
  const map = new Map<string, HistoryEntry>();
  for (const e of entries) map.set(e.id, e);
  return map;
}

function prefixes(rows: ReturnType<typeof buildGraphRows>): string[] {
  return rows.map((r) => r.prefix + (r.isHead ? "HEAD " : "") + (r.entry?.description ?? (r.isRoot ? "初期状態" : "")));
}

describe("buildGraphRows", () => {
  // =========================================================================
  // Basic cases
  // =========================================================================

  it("empty: no entries", () => {
    expect(buildGraphRows(toMap([]), "")).toEqual([]);
  });

  it("empty: head references missing entry", () => {
    expect(buildGraphRows(toMap([]), "missing")).toEqual([]);
  });

  it("single entry, head on it", () => {
    const entries = toMap([entry("A", "", "root")]);
    const result = prefixes(buildGraphRows(entries, "A"));
    expect(result).toEqual(["* HEAD root", "* 初期状態"]);
  });

  it("single entry, head at root (empty head)", () => {
    const entries = toMap([entry("A", "", "root")]);
    const result = prefixes(buildGraphRows(entries, ""));
    // HEAD is at root (empty string) → virtual root node has HEAD label
    expect(result).toEqual(["* root", "* HEAD 初期状態"]);
  });

  // =========================================================================
  // Linear chain (no branches)
  // =========================================================================

  it("linear chain of 3: head on newest", () => {
    // A → B → C (head=C)
    const entries = toMap([entry("A", "", "first"), entry("B", "A", "second"), entry("C", "B", "third")]);
    const result = prefixes(buildGraphRows(entries, "C"));
    expect(result).toEqual(["* HEAD third", "* second", "* first", "* 初期状態"]);
  });

  it("linear chain of 3: head in middle", () => {
    // A → B → C (head=B)
    const entries = toMap([entry("A", "", "first"), entry("B", "A", "second"), entry("C", "B", "third")]);
    const result = prefixes(buildGraphRows(entries, "B"));
    // C is newest, so main column = C → B → A. HEAD label on B.
    expect(result).toEqual(["* third", "* HEAD second", "* first", "* 初期状態"]);
  });

  it("linear chain of 3: head on oldest", () => {
    const entries = toMap([entry("A", "", "first"), entry("B", "A", "second"), entry("C", "B", "third")]);
    const result = prefixes(buildGraphRows(entries, "A"));
    expect(result).toEqual(["* third", "* second", "* HEAD first", "* 初期状態"]);
  });

  // =========================================================================
  // Single branch
  // =========================================================================

  it("single branch, head on main line", () => {
    // A → B (main, newest), A → C (branch). head=B
    const entries = toMap([entry("A", "", "root"), entry("B", "A", "b-main"), entry("C", "A", "c-branch")]);
    // B > C by ID desc, so B is main line
    const result = prefixes(buildGraphRows(entries, "B"));
    // Wait — "C" > "B" alphabetically, so C is newest (main line)
    // Let me re-check: localeCompare("C", "B") = 1, so C > B.
    // children of A sorted desc: [C, B]. Newest first = C. Main line = [C, A].
    // B is a branch from A.
    expect(result).toEqual(["* c-branch", "| * HEAD b-main", "|/  ", "* root", "* 初期状態"]);
  });

  it("single branch, head on branch", () => {
    // Same tree, head=C (C is newest, main line)
    const entries = toMap([entry("A", "", "root"), entry("B", "A", "b-branch"), entry("C", "A", "c-main")]);
    const result = prefixes(buildGraphRows(entries, "C"));
    // C is main line (newest). B is branch.
    expect(result).toEqual(["* HEAD c-main", "| * b-branch", "|/  ", "* root", "* 初期状態"]);
  });

  it("single branch, head at root", () => {
    const entries = toMap([entry("A", "", "root"), entry("B", "A", "b"), entry("C", "A", "c")]);
    const result = prefixes(buildGraphRows(entries, "A"));
    // C is main line (newest). B is branch. HEAD on A.
    expect(result).toEqual(["* c", "| * b", "|/  ", "* HEAD root", "* 初期状態"]);
  });

  // =========================================================================
  // Multiple branches from the same parent
  // =========================================================================

  it("3 branches from same parent", () => {
    // A → B, A → C, A → D. Newest is D. Main line = [D, A].
    const entries = toMap([entry("A", "", "root"), entry("B", "A", "b"), entry("C", "A", "c"), entry("D", "A", "d")]);
    const result = prefixes(buildGraphRows(entries, "D"));
    // Children of A sorted desc: [D, C, B]. D is main line.
    // C and B are branches (in that order since we iterate [D, C, B] and skip D)
    expect(result).toEqual(["* HEAD d", "| * c", "|/  ", "| * b", "|/  ", "* root", "* 初期状態"]);
  });

  // =========================================================================
  // Branches with descendants
  // =========================================================================

  it("branch with chain (single descendant)", () => {
    // A → B (branch root), A → C (main). B → D (chain).
    // Newest is D. Main line = [D, B, A]? No, D's parent is B.
    // Let me re-check: main line walks from newest. newest = D (by ID desc: D > C > B > A).
    // D → B → A. Main line = [D, B, A].
    // C is a branch from A.
    const entries = toMap([entry("A", "", "root"), entry("B", "A", "b"), entry("C", "A", "c"), entry("D", "B", "d")]);
    const result = prefixes(buildGraphRows(entries, "D"));
    expect(result).toEqual(["* HEAD d", "* b", "| * c", "|/  ", "* root", "* 初期状態"]);
  });

  it("branch with multi-commit chain", () => {
    // A → B → C (main via B), A → D → E (branch)
    // Newest = E > D > C > B > A. But E's parent is D, D's parent is A.
    // Main line walks from newest: E → D → A. Main line = [E, D, A].
    // B and C are branches from A.
    const entries = toMap([
      entry("A", "", "root"),
      entry("B", "A", "b"),
      entry("C", "B", "c"),
      entry("D", "A", "d"),
      entry("E", "D", "e"),
    ]);
    const result = prefixes(buildGraphRows(entries, "E"));
    // Main line = [E, D, A]. B is a branch from A, with chain C.
    // emitSubtree(B) walks B → C, emits C first then B.
    expect(result).toEqual(["* HEAD e", "* d", "| * c", "| * b", "|/  ", "* root", "* 初期状態"]);
  });

  // =========================================================================
  // Nested branches (branch within a branch)
  // =========================================================================

  it("sub-branch: branch has its own fork", () => {
    // A → B (main), A → C (branch), C → D, C → E (sub-branch from C)
    // Newest by ID desc: E > D > C > B > A. But E's parent is C, C's parent is A.
    // Main line walks from newest: E → C → A. Main line = [E, C, A].
    // B is a branch from A. D is a sub-branch from C (already on main line).
    const entries = toMap([
      entry("A", "", "root"),
      entry("B", "A", "b"),
      entry("C", "A", "c"),
      entry("D", "C", "d"),
      entry("E", "C", "e"),
    ]);
    const result = prefixes(buildGraphRows(entries, "E"));
    // Main line = [E, C, A]. C's children: [E (main), D (sub-branch)].
    // D is shown as branch above C. B is shown as branch above A.
    expect(result).toEqual(["* HEAD e", "| * d", "|/  ", "* c", "| * b", "|/  ", "* root", "* 初期状態"]);
  });

  // =========================================================================
  // Head positions that differ from newest
  // =========================================================================

  it("head on older entry after undo, with only 1 chain", () => {
    // A → B → C. head=A (undone to root).
    // Main line = [C, B, A] (from newest). HEAD label on A.
    const entries = toMap([entry("A", "", "root"), entry("B", "A", "b"), entry("C", "B", "c")]);
    const result = prefixes(buildGraphRows(entries, "A"));
    expect(result).toEqual(["* c", "* b", "* HEAD root", "* 初期状態"]);
  });

  it("head on older entry with sibling branches", () => {
    // A → B (newest), A → C. head=A.
    // Main line = [B, A]. C is branch. HEAD on A.
    const entries = toMap([entry("A", "", "root"), entry("B", "A", "b"), entry("C", "A", "c")]);
    // Actually C > B by ID. Main line = [C, A]. B is branch.
    const result = prefixes(buildGraphRows(entries, "A"));
    expect(result).toEqual(["* c", "| * b", "|/  ", "* HEAD root", "* 初期状態"]);
  });

  // =========================================================================
  // Complex realistic scenarios
  // =========================================================================

  it("realistic: multiple undos and redos create many siblings", () => {
    // User did: create → edit1 → undo → edit2 → undo → edit3 → undo → edit4
    // Tree:
    //   A (root)
    //   ├── B (edit1, undone)
    //   ├── C (edit2, undone)
    //   ├── D (edit3, undone)
    //   └── E (edit4, HEAD)
    // Main line = [E, A] (E is newest). B, C, D are branches.
    const entries = toMap([
      entry("A", "", "create"),
      entry("B", "A", "edit1"),
      entry("C", "A", "edit2"),
      entry("D", "A", "edit3"),
      entry("E", "A", "edit4"),
    ]);
    const result = prefixes(buildGraphRows(entries, "E"));
    // Main = [E, A]. Branches of A (non-main): [D, C, B] (sorted desc after removing E)
    expect(result).toEqual([
      "* HEAD edit4",
      "| * edit3",
      "|/  ",
      "| * edit2",
      "|/  ",
      "| * edit1",
      "|/  ",
      "* create",
      "* 初期状態",
    ]);
  });

  it("realistic: fork with descendants on both sides", () => {
    // A → B → C (main), A → D → E (branch with chain)
    // Actually: by ID, main line walks from newest. newest = E.
    // Main line = [E, D, A]. B and C are branches from A.
    // Let me use different IDs to make C the newest.
    const entries = toMap([
      entry("A", "", "root"),
      entry("B", "A", "b1"),
      entry("C", "B", "b2"),
      entry("D", "A", "d1"),
      entry("E", "D", "d2"),
      entry("F", "E", "d3"),
    ]);
    // Newest = F. Main line walks F → E → D → A.
    const result = prefixes(buildGraphRows(entries, "F"));
    // Main = [F, E, D, A]. B is a branch from A, with chain C.
    // emitSubtree(B) builds chain [B, C], emits C then B.
    expect(result).toEqual(["* HEAD d3", "* d2", "* d1", "| * b2", "| * b1", "|/  ", "* root", "* 初期状態"]);
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  it("disconnected entry is ignored (no parent in map)", () => {
    // placeholder — real test below
  });
});

describe("buildKeyedGraphRows", () => {
  it("uses entry ids for entry rows and stable distinct keys for separators and root", () => {
    const rows = buildGraphRows(
      toMap([
        entry("A", "", "root"),
        entry("B", "A", "branch"),
        entry("C", "A", "main"),
      ]),
      "B",
    );

    const keyed = buildKeyedGraphRows(rows);
    expect(keyed.map((row) => row.key)).toEqual([
      "C",
      "B",
      "separator:2:|/  ",
      "A",
      "__root__",
    ]);
  });

  it("keeps entry keys stable when the current head changes", () => {
    const entries = toMap([
      entry("A", "", "root"),
      entry("B", "A", "branch"),
      entry("C", "A", "main"),
    ]);

    const headB = buildKeyedGraphRows(buildGraphRows(entries, "B")).filter((row) => row.entry);
    const headC = buildKeyedGraphRows(buildGraphRows(entries, "C")).filter((row) => row.entry);

    expect(headB.map((row) => row.key)).toEqual(["C", "B", "A"]);
    expect(headC.map((row) => row.key)).toEqual(["C", "B", "A"]);
  });
});

describe("isRoot flag", () => {
  it("entry rows are never root, only virtual root node is", () => {
    const entries = toMap([entry("A", "", "root")]);
    const rows = buildGraphRows(entries, "A");
    // Entry row: isRoot=false
    expect(rows[0].entry?.id).toBe("A");
    expect(rows[0].isRoot).toBe(false);
    // Virtual root: isRoot=true
    expect(rows[1].entry).toBeUndefined();
    expect(rows[1].isRoot).toBe(true);
  });

  it("no entry in a chain is marked as root", () => {
    const entries = toMap([entry("A", "", "root"), entry("B", "A", "second"), entry("C", "B", "third")]);
    const rows = buildGraphRows(entries, "C");
    const entryRows = rows.filter((r) => r.entry);
    for (const row of entryRows) {
      expect(row.isRoot).toBe(false);
    }
    // Last row is virtual root
    expect(rows[rows.length - 1].isRoot).toBe(true);
    expect(rows[rows.length - 1].entry).toBeUndefined();
  });

  it("long main line chain: only last entry is root (scroll scenario)", () => {
    // Simulate a long history that would require scrolling
    const chain = [];
    for (let i = 0; i < 30; i++) {
      const id = String.fromCharCode(65 + i); // A, B, C, ... up to ~Z
      const parent = i === 0 ? "" : String.fromCharCode(65 + i - 1);
      chain.push(entry(id, parent, `entry${i}`));
    }
    const entries = toMap(chain);
    const headId = chain[chain.length - 1].id;
    const rows = buildGraphRows(entries, headId);

    // Second-to-last row (oldest entry with parentId='') should not be root (has siblings from virtual root)
    // Last row is the virtual root node (entry=undefined, isRoot=true)
    const entryRows = rows.filter((r) => r.entry);
    for (let i = 0; i < entryRows.length - 1; i++) {
      expect(entryRows[i].isRoot, `row ${i} (${entryRows[i].entry?.id}) should not be root`).toBe(false);
    }
    // Virtual root is the last row
    expect(rows[rows.length - 1].isRoot).toBe(true);
    expect(rows[rows.length - 1].entry).toBeUndefined();
  });

  it("all entry rows are never root, virtual root is the only root", () => {
    const entries = toMap([entry("A", "", "root"), entry("B", "A", "main"), entry("C", "A", "branch")]);
    const rows = buildGraphRows(entries, "C");
    const entryRows = rows.filter((r) => r.entry);
    for (const row of entryRows) {
      expect(row.isRoot).toBe(false);
    }
    const virtualRoot = rows[rows.length - 1];
    expect(virtualRoot.entry).toBeUndefined();
    expect(virtualRoot.isRoot).toBe(true);
  });
});

describe("continuationPrefix", () => {
  it("main line commit → continuation", () => {
    expect(continuationPrefix("* ", false)).toBe("| ");
  });

  it("main line commit at root → spaces", () => {
    expect(continuationPrefix("* ", true)).toBe("  ");
  });

  it("branch commit → continuation", () => {
    expect(continuationPrefix("| * ", false)).toBe("| | ");
  });

  it("sub-branch commit → continuation", () => {
    expect(continuationPrefix("| | * ", false)).toBe("| | | ");
  });

  it("fork row → spaces", () => {
    expect(continuationPrefix("|/  ", false)).toBe("|   ");
  });

  it("nested fork row → spaces", () => {
    expect(continuationPrefix("| |/  ", false)).toBe("| |   ");
  });
});

describe("buildGraphRows (continued)", () => {
  it("real disconnected entry is ignored (no parent in map)", () => {
    // X has a parent that doesn't exist in entries. It's still the newest by ID.
    // X.parentId = "missing" ≠ A.parentId = "", so A is not a root-level sibling of X.
    const entries = toMap([entry("A", "", "root"), entry("X", "missing", "orphan")]);
    const result = prefixes(buildGraphRows(entries, "X"));
    expect(result).toEqual(["* HEAD orphan", "* 初期状態"]);
  });

  it("root-level siblings: multiple entries with parentId=''", () => {
    // Simulates undo+redo cycles where each redo creates a new root-level entry.
    const entries = toMap([entry("A", "", "first"), entry("B", "", "second"), entry("C", "", "third")]);
    const result = prefixes(buildGraphRows(entries, "C"));
    // Main line = [C] (newest). A, B are root-level siblings shown as branches from the virtual root.
    expect(result).toEqual(["* HEAD third", "| * second", "|/  ", "| * first", "|/  ", "* 初期状態"]);
  });

  it("root-level siblings: head on older sibling", () => {
    const entries = toMap([entry("A", "", "first"), entry("B", "", "second"), entry("C", "", "third")]);
    const result = prefixes(buildGraphRows(entries, "A"));
    // Main line = [C]. A, B are siblings from the virtual root. HEAD label on A.
    expect(result).toEqual(["* third", "| * second", "|/  ", "| * HEAD first", "|/  ", "* 初期状態"]);
  });
});

describe("findInverseOp", () => {
  function makeEntry(
    ops: { type: string; collection: string; id: string; data?: Record<string, unknown> }[],
    invOps: { type: string; collection: string; id: string; data?: Record<string, unknown> }[],
  ): HistoryEntry {
    return {
      id: "E",
      parentId: "",
      description: "test",
      operations: ops as HistoryEntry["operations"],
      inverseOperations: invOps as HistoryEntry["inverseOperations"],
      prevSelection: {},
      nextSelection: {},
      createdAt: ts,
      updatedAt: ts,
    };
  }

  it("returns matching inverse op when lengths match", () => {
    const e = makeEntry(
      [
        { type: "set", collection: "lifeLogs", id: "d1", data: { text: "new" } },
        { type: "update", collection: "lifeLogs", id: "d2", data: { text: "updated" } },
      ],
      [
        { type: "update", collection: "lifeLogs", id: "d2", data: { text: "old" } },
        { type: "delete", collection: "lifeLogs", id: "d1" },
      ],
    );
    // fwdOps[0] (set d1) → invOps[1] (delete d1)
    const inv0 = findInverseOp(e, e.operations[0], 0);
    expect(inv0).toEqual({ type: "delete", collection: "lifeLogs", id: "d1" });

    // fwdOps[1] (update d2) → invOps[0] (update d2)
    const inv1 = findInverseOp(e, e.operations[1], 1);
    expect(inv1).toEqual({ type: "update", collection: "lifeLogs", id: "d2", data: { text: "old" } });
  });

  it("returns undefined when inverse ops are shorter due to cache miss", () => {
    // Forward: set(d1), update(d2), delete(d3)
    // Inverse: only delete(d1) — update and delete had cache miss
    const e = makeEntry(
      [
        { type: "set", collection: "col", id: "d1", data: { text: "a" } },
        { type: "update", collection: "col", id: "d2", data: { text: "b" } },
        { type: "delete", collection: "col", id: "d3" },
      ],
      [{ type: "delete", collection: "col", id: "d1" }],
    );

    // fwdOps[0] (set d1): invIndex=0, candidate is delete(d1) → match
    const inv0 = findInverseOp(e, e.operations[0], 0);
    expect(inv0).toEqual({ type: "delete", collection: "col", id: "d1" });

    // fwdOps[1] (update d2): invIndex=-1 → out of bounds → undefined
    const inv1 = findInverseOp(e, e.operations[1], 1);
    expect(inv1).toBeUndefined();

    // fwdOps[2] (delete d3): invIndex=-2 → out of bounds → undefined
    const inv2 = findInverseOp(e, e.operations[2], 2);
    expect(inv2).toBeUndefined();
  });

  it("returns undefined when candidate has different collection/id", () => {
    const e = makeEntry(
      [
        { type: "update", collection: "col", id: "d1", data: { text: "a" } },
        { type: "update", collection: "col", id: "d2", data: { text: "b" } },
      ],
      [
        { type: "update", collection: "col", id: "d1", data: { text: "old-a" } },
        // d2 had cache miss, so only d1's inverse exists; d1 is at index 0
        // But array has only 1 element — index mapping puts d1's inverse at wrong position
      ],
    );
    // Shrink inverse to 1 element to simulate cache miss
    e.inverseOperations = [{ type: "update", collection: "col", id: "d1", data: { text: "old-a" } }];

    // fwdOps[0] (d1): invIndex=0, candidate is d1 → match
    const inv0 = findInverseOp(e, e.operations[0], 0);
    expect(inv0).toEqual({ type: "update", collection: "col", id: "d1", data: { text: "old-a" } });

    // fwdOps[1] (d2): invIndex=-1 → out of bounds → undefined
    const inv1 = findInverseOp(e, e.operations[1], 1);
    expect(inv1).toBeUndefined();
  });
});
