import { describe, it, expect } from "vitest";

import { deriveInverseOps } from "@/writeContract/inverseOps";
import { type WriteOp } from "@/writeContract/types";

describe("deriveInverseOps", () => {
  it("inverts a set into a delete (no old value needed)", () => {
    const forward: WriteOp[] = [{ type: "set", collection: "c", id: "newDoc", data: { text: "hello", value: 42 } }];

    expect(deriveInverseOps(forward, new Map())).toEqual([{ type: "delete", collection: "c", id: "newDoc" }]);
  });

  it("inverts an update by restoring only the fields the forward op touched", () => {
    const forward: WriteOp[] = [{ type: "update", collection: "c", id: "doc", data: { text: "new" } }];
    const oldValues = new Map([["c/doc", { text: "old", value: 1 }]]);

    expect(deriveInverseOps(forward, oldValues)).toEqual([
      { type: "update", collection: "c", id: "doc", data: { text: "old" } },
    ]);
  });

  it("inverts a delete by re-creating the full old document", () => {
    const forward: WriteOp[] = [{ type: "delete", collection: "c", id: "doc" }];
    const oldValues = new Map([["c/doc", { text: "hello", value: 42 }]]);

    expect(deriveInverseOps(forward, oldValues)).toEqual([
      { type: "set", collection: "c", id: "doc", data: { text: "hello", value: 42 } },
    ]);
  });

  it("returns inverse ops in reverse order of the forward ops", () => {
    const forward: WriteOp[] = [
      { type: "set", collection: "c", id: "doc1", data: {} },
      { type: "set", collection: "c", id: "doc2", data: {} },
      { type: "set", collection: "c", id: "doc3", data: {} },
    ];

    const inverse = deriveInverseOps(forward, new Map());

    expect(inverse.map((op) => op.id)).toEqual(["doc3", "doc2", "doc1"]);
  });

  it("handles mixed set/update/delete in one batch, reversed", () => {
    const forward: WriteOp[] = [
      { type: "set", collection: "c", id: "newDoc", data: { text: "created", value: 1 } },
      { type: "update", collection: "c", id: "updateDoc", data: { text: "after" } },
      { type: "delete", collection: "c", id: "deleteDoc" },
    ];
    const oldValues = new Map([
      ["c/updateDoc", { text: "before", value: 10 }],
      ["c/deleteDoc", { text: "toDelete", value: 99 }],
    ]);

    expect(deriveInverseOps(forward, oldValues)).toEqual([
      { type: "set", collection: "c", id: "deleteDoc", data: { text: "toDelete", value: 99 } },
      { type: "update", collection: "c", id: "updateDoc", data: { text: "before" } },
      { type: "delete", collection: "c", id: "newDoc" },
    ]);
  });

  it("skips the inverse of an update or delete when no old value was captured", () => {
    const forward: WriteOp[] = [
      { type: "update", collection: "c", id: "uncachedUpdate", data: { text: "x" } },
      { type: "delete", collection: "c", id: "uncachedDelete" },
    ];

    expect(deriveInverseOps(forward, new Map())).toEqual([]);
  });

  it("builds a partial inverse when only some old values are present", () => {
    const forward: WriteOp[] = [
      { type: "set", collection: "c", id: "newDoc", data: { text: "hello", value: 1 } },
      { type: "update", collection: "c", id: "uncachedUpdate", data: { text: "x" } },
      { type: "delete", collection: "c", id: "uncachedDelete" },
    ];

    expect(deriveInverseOps(forward, new Map())).toEqual([{ type: "delete", collection: "c", id: "newDoc" }]);
  });

  it("only restores fields present in both the forward data and the old value", () => {
    const forward: WriteOp[] = [{ type: "update", collection: "c", id: "doc", data: { text: "new", added: 1 } }];
    // `added` did not exist in the old document, so it must not appear in the inverse.
    const oldValues = new Map([["c/doc", { text: "old", value: 1 }]]);

    expect(deriveInverseOps(forward, oldValues)).toEqual([
      { type: "update", collection: "c", id: "doc", data: { text: "old" } },
    ]);
  });
});
