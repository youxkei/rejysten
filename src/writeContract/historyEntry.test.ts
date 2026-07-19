import { describe, it, expect } from "vitest";

import { buildHistoryEntry } from "@/writeContract/historyEntry";
import { type Selection, type WriteOp } from "@/writeContract/types";

describe("buildHistoryEntry", () => {
  it("bundles exactly the six entry fields, leaving id/timestamps to the caller", () => {
    const operations: WriteOp[] = [{ type: "set", collection: "lifeLogs", id: "a", data: { text: "" } }];
    const inverseOperations: WriteOp[] = [{ type: "delete", collection: "lifeLogs", id: "a" }];
    const prevSelection: Selection = {};
    const nextSelection: Selection = { lifeLogs: "a" };

    const entry = buildHistoryEntry({
      parentId: "parent",
      description: "LifeLog作成",
      operations,
      inverseOperations,
      prevSelection,
      nextSelection,
    });

    expect(entry).toEqual({
      parentId: "parent",
      description: "LifeLog作成",
      operations,
      inverseOperations,
      prevSelection: {},
      nextSelection: { lifeLogs: "a" },
    });
    expect(Object.keys(entry).sort()).toEqual(
      ["description", "inverseOperations", "nextSelection", "operations", "parentId", "prevSelection"].sort(),
    );
  });

  it("passes operations and selections through by reference (pure passthrough)", () => {
    const operations: WriteOp[] = [];
    const prevSelection: Selection = {};
    const nextSelection: Selection = { lifeLogs: "x" };

    const entry = buildHistoryEntry({
      parentId: "",
      description: "",
      operations,
      inverseOperations: [],
      prevSelection,
      nextSelection,
    });

    expect(entry.operations).toBe(operations);
    expect(entry.nextSelection).toBe(nextSelection);
  });
});
