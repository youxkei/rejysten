import { deleteField, increment, serverTimestamp, Timestamp } from "firebase/firestore";
import { describe, it, expect, vi } from "vitest";

import {
  createOptimisticOverlay,
  type OverlayMutation,
  type QueryMetadata,
} from "@/firestore/optimisticOverlay";
import { orderBy, where } from "@/firestore/query";

function setMutation(id: string, data: Record<string, unknown>): OverlayMutation {
  return {
    type: "set",
    batchId: "",
    collection: "__overlayTest__",
    id,
    path: `__overlayTest__/${id}`,
    data,
  };
}

function updateMutation(id: string, data: Record<string, unknown>): OverlayMutation {
  return {
    type: "update",
    batchId: "",
    collection: "__overlayTest__",
    id,
    path: `__overlayTest__/${id}`,
    data,
  };
}

function deleteMutation(id: string): OverlayMutation {
  return {
    type: "delete",
    batchId: "",
    collection: "__overlayTest__",
    id,
    path: `__overlayTest__/${id}`,
  };
}

function metadata(opts?: Partial<QueryMetadata>): QueryMetadata {
  return {
    collection: "__overlayTest__",
    filters: [],
    orderBys: [],
    ...opts,
  };
}

type TestRecord = Record<string, unknown>;
const emptySnap: (TestRecord & { id: string })[] = [];

describe("mergeDocument", () => {
  it("set overlay materializes a document from missing snapshot", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "hello" })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toEqual({ id: "a", text: "hello" });
  });

  it("reports only composed set overlays as document set overlays", () => {
    const overlay = createOptimisticOverlay();

    expect(overlay.hasDocumentSetOverlay("__overlayTest__/a")).toBe(false);

    overlay.apply("b1", [setMutation("a", { text: "hello" })]);
    expect(overlay.hasDocumentSetOverlay("__overlayTest__/a")).toBe(true);

    overlay.apply("b2", [updateMutation("a", { value: 1 })]);
    expect(overlay.hasDocumentSetOverlay("__overlayTest__/a")).toBe(true);

    overlay.apply("b3", [deleteMutation("a")]);
    expect(overlay.hasDocumentSetOverlay("__overlayTest__/a")).toBe(false);

    overlay.apply("b4", [updateMutation("b", { text: "update-only" })]);
    expect(overlay.hasDocumentSetOverlay("__overlayTest__/b")).toBe(false);
  });

  it("set overlay replaces existing snapshot", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "hello" })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "old", value: 1 });
    expect(result).toEqual({ id: "a", text: "hello" });
  });

  it("update overlay merges into snapshot data", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("a", { text: "new" })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "old", value: 1 });
    expect(result).toEqual({ id: "a", text: "new", value: 1 });
  });

  it("update overlay applies dotted field paths into nested objects", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("a", { "nested.count": 2, "nested.label": "new" })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", {
      id: "a",
      text: "old",
      nested: { count: 1, keep: true },
    });
    expect(result).toEqual({
      id: "a",
      text: "old",
      nested: { count: 2, keep: true, label: "new" },
    });
  });

  it("update overlay does not create document when snapshot is missing", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("a", { text: "new" })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toBeUndefined();
  });

  it("update overlay uses acknowledged base when snapshot is missing", () => {
    const overlay = createOptimisticOverlay();
    overlay.acknowledgeDocument("__overlayTest__/a", { text: "old", value: 1 });
    overlay.apply("b1", [updateMutation("a", { text: "new" })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toEqual({ id: "a", text: "new", value: 1 });
  });

  it("delete overlay returns undefined when snapshot exists", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a")]);
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "old" });
    expect(result).toBeUndefined();
  });

  it("delete overlay returns undefined when snapshot is missing", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a")]);
    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toBeUndefined();
  });

  it("composes set then update", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "hello", value: 1 }), updateMutation("a", { value: 2 })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toEqual({ id: "a", text: "hello", value: 2 });
  });

  it("composes update then update", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("a", { text: "x" }), updateMutation("a", { value: 7 })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "old", value: 0 });
    expect(result).toEqual({ id: "a", text: "x", value: 7 });
  });

  it("composes set then delete", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "hello" }), deleteMutation("a")]);
    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toBeUndefined();
  });

  it("composes delete then set (revival)", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a"), setMutation("a", { text: "again" })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "old" });
    expect(result).toEqual({ id: "a", text: "again" });
  });

  it("delete then update is ignored", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a"), updateMutation("a", { text: "x" })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "old" });
    expect(result).toBeUndefined();
  });

  it("composes mutations from multiple batches in apply order", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "hello", value: 1 })]);
    overlay.apply("b2", [updateMutation("a", { value: 99 })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toEqual({ id: "a", text: "hello", value: 99 });
  });

  it("appends mutations when apply is called twice with the same batch id", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "hello", value: 1 })]);
    overlay.apply("b1", [updateMutation("a", { value: 2 })]);
    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toEqual({ id: "a", text: "hello", value: 2 });
  });

  it("does not affect different documents", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "x" })]);
    const result = overlay.mergeDocument("__overlayTest__", "b", { id: "b", text: "y" });
    expect(result).toEqual({ id: "b", text: "y" });
  });

  it("treats same id in different collections as different docs", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "in-overlay" })]);
    const result = overlay.mergeDocument("__overlayTestOther__", "a", { id: "a", text: "other" });
    expect(result).toEqual({ id: "a", text: "other" });
  });
});

describe("batch lifecycle", () => {
  it("apply increments version$", () => {
    const overlay = createOptimisticOverlay();
    const before = overlay.version$();
    overlay.apply("b1", [setMutation("a", { text: "x" })]);
    expect(overlay.version$()).toBeGreaterThan(before);
  });

  it("notifies subscribers when version changes", () => {
    const overlay = createOptimisticOverlay();
    let calls = 0;
    const unsubscribe = overlay.subscribe(() => {
      calls++;
    });

    overlay.apply("b1", [setMutation("a", { text: "x" })]);
    expect(calls).toBe(1);

    unsubscribe();
    overlay.rollback("b1", undefined);
    expect(calls).toBe(1);
  });

  it("empty mutations apply is a no-op", () => {
    const overlay = createOptimisticOverlay();
    const before = overlay.version$();
    overlay.apply("b1", []);
    expect(overlay.version$()).toBe(before);
  });

  it("markCommitted on unknown batch is no-op", () => {
    const overlay = createOptimisticOverlay();
    const before = overlay.version$();
    overlay.markCommitted("nope");
    expect(overlay.version$()).toBe(before);
  });

  it("markCommitted on already committed batch is a no-op", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "x" })]);
    overlay.markCommitted("b1");
    const before = overlay.version$();
    overlay.markCommitted("b1");
    expect(overlay.version$()).toBe(before);
  });

  it("rollback removes batch mutations", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "x" })]);
    overlay.rollback("b1", undefined);
    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toBeUndefined();
  });

  it("rollback removes only the failed batch when another batch still affects the document", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "first", value: 1 })]);
    overlay.apply("b2", [updateMutation("a", { value: 2 })]);
    overlay.rollback("b2", undefined);

    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toEqual({ id: "a", text: "first", value: 1 });
  });

  it("rollback of an older batch recalculates latest known data from remaining batches", () => {
    const overlay = createOptimisticOverlay();
    overlay.acknowledgeDocument("__overlayTest__/a", { text: "server", value: 0 });
    overlay.apply("b1", [setMutation("a", { text: "first", value: 1 })]);
    overlay.apply("b2", [updateMutation("a", { value: 2 })]);

    overlay.rollback("b1", undefined);

    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toEqual({ id: "a", text: "server", value: 2 });
  });

  it("rollback on unknown batch is no-op", () => {
    const overlay = createOptimisticOverlay();
    const before = overlay.version$();
    overlay.rollback("nope", undefined);
    expect(overlay.version$()).toBe(before);
  });

  it("rollback bumps version$", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "x" })]);
    const v = overlay.version$();
    overlay.rollback("b1", undefined);
    expect(overlay.version$()).toBeGreaterThan(v);
  });

  it("pending batch survives matching server data", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "x" })]);
    overlay.acknowledgeDocument("__overlayTest__/a", { text: "x" });
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "x" });
    expect(result).toEqual({ id: "a", text: "x" });
  });

  it("committed batch persists until server data matches", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "x" })]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", { text: "stale" });
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "stale" });
    expect(result).toEqual({ id: "a", text: "x" });
  });

  it("committed batch is removed once server data matches", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "x", value: 1 })]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", { text: "x", value: 1 });
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "x", value: 1 });
    expect(result).toEqual({ id: "a", text: "x", value: 1 });
    // After ack, overlay should not be holding onto the mutation; if we now pass mismatching data
    overlay.acknowledgeDocument("__overlayTest__/a", { text: "newer", value: 2 });
    const after = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "newer", value: 2 });
    expect(after).toEqual({ id: "a", text: "newer", value: 2 });
  });

  it("committed batch is removed when matching server data was acknowledged before commit", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "x", value: 1 })]);
    overlay.acknowledgeDocument("__overlayTest__/a", { text: "x", value: 1 });
    overlay.markCommitted("b1");

    overlay.acknowledgeDocument("__overlayTest__/a", { text: "newer", value: 2 });
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "newer", value: 2 });
    expect(result).toEqual({ id: "a", text: "newer", value: 2 });
  });

  it("committed delete is removed when missing server data was acknowledged before commit", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a")]);
    overlay.acknowledgeDocument("__overlayTest__/a", undefined);
    overlay.markCommitted("b1");

    overlay.acknowledgeDocument("__overlayTest__/a", { text: "recreated" });
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "recreated" });
    expect(result).toEqual({ id: "a", text: "recreated" });
  });

  it("clears stale committed delete when a later committed restore reaches the server", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("delete", [deleteMutation("a")]);
    overlay.markCommitted("delete");

    overlay.apply("restore", [setMutation("a", { text: "restored", value: 1 })]);
    overlay.markCommitted("restore");
    overlay.apply("update", [updateMutation("a", { value: 2 })]);
    overlay.markCommitted("update");

    overlay.acknowledgeDocument("__overlayTest__/a", { text: "restored", value: 2 });

    const documentResult = overlay.mergeDocument("__overlayTest__", "a", {
      id: "a",
      text: "restored",
      value: 2,
    });
    expect(documentResult).toEqual({ id: "a", text: "restored", value: 2 });

    const queryResult = overlay.mergeQuery(
      [{ id: "a", text: "restored", value: 2 }],
      metadata({ filters: [where("value", "==", 2)] }),
    );
    expect(queryResult).toEqual([{ id: "a", text: "restored", value: 2 }]);
  });

  it("partial document catch-up clears matched docs only", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", { text: "x" }),
      setMutation("b", { text: "y" }),
    ]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", { text: "x" });
    // a should now be cleared from overlay; b still present
    const a = overlay.mergeDocument("__overlayTest__", "a", undefined);
    const b = overlay.mergeDocument("__overlayTest__", "b", undefined);
    expect(a).toBeUndefined();
    expect(b).toEqual({ id: "b", text: "y" });
  });

  it("delete mutation considered caught up when server is undefined", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a")]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", undefined);
    const result = overlay.mergeDocument("__overlayTest__", "a", undefined);
    expect(result).toBeUndefined();
  });

  it("update caught up once server has merged values", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("a", { value: 9 })]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", { text: "old", value: 9 });
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "old", value: 9 });
    expect(result).toEqual({ id: "a", text: "old", value: 9 });
  });

  it("clears same-document committed mutations as a composed unit", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      updateMutation("a", { text: "A1" }),
      updateMutation("a", { text: "A2" }),
      updateMutation("a", { text: "A3" }),
    ]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", { text: "A3" });

    overlay.acknowledgeDocument("__overlayTest__/a", { text: "server-newer" });
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "server-newer" });
    expect(result).toEqual({ id: "a", text: "server-newer" });
  });

  it("dotted update caught up once server has nested merged values", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("a", { "nested.value": 9 })]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", { nested: { value: 9, keep: true } });

    overlay.acknowledgeDocument("__overlayTest__/a", { nested: { value: 10, keep: true } });
    const result = overlay.mergeDocument("__overlayTest__", "a", {
      id: "a",
      nested: { value: 10, keep: true },
    });
    expect(result).toEqual({ id: "a", nested: { value: 10, keep: true } });
  });

  it("ignores createdAt/updatedAt during catch-up comparison", () => {
    const overlay = createOptimisticOverlay();
    const ts = Timestamp.fromMillis(1);
    overlay.apply("b1", [setMutation("a", { text: "x", createdAt: ts, updatedAt: ts })]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", {
      text: "x",
      createdAt: Timestamp.fromMillis(999),
      updatedAt: Timestamp.fromMillis(999),
    });
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "x" });
    expect(result).toEqual({ id: "a", text: "x" });
  });

  it("uses configured ignored fields during catch-up comparison", () => {
    const overlay = createOptimisticOverlay({ ignoredFieldsForCatchUp: ["syncedAt"] });
    overlay.apply("b1", [setMutation("a", { text: "x", syncedAt: Timestamp.fromMillis(1) })]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", {
      text: "x",
      syncedAt: Timestamp.fromMillis(999),
    });

    overlay.acknowledgeDocument("__overlayTest__/a", { text: "server-newer" });
    const result = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "server-newer" });
    expect(result).toEqual({ id: "a", text: "server-newer" });
  });

  it("nested object and array values are compared during catch-up", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { tags: ["x", "y"], nested: { ok: true } })]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", { tags: ["x", "y"], nested: { ok: true } });

    overlay.acknowledgeDocument("__overlayTest__/a", { tags: ["z"], nested: { ok: false } });
    const result = overlay.mergeDocument("__overlayTest__", "a", {
      id: "a",
      tags: ["z"],
      nested: { ok: false },
    });
    expect(result).toEqual({ id: "a", tags: ["z"], nested: { ok: false } });
  });

  it("committed overlay persists when nested catch-up data differs", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { tags: ["x", "y"], nested: { ok: true } })]);
    overlay.markCommitted("b1");
    overlay.acknowledgeDocument("__overlayTest__/a", { tags: ["x"], nested: { ok: true } });

    const result = overlay.mergeDocument("__overlayTest__", "a", {
      id: "a",
      tags: ["x"],
      nested: { ok: true },
    });
    expect(result).toEqual({ id: "a", tags: ["x", "y"], nested: { ok: true } });
  });
});

describe("mergeQuery", () => {
  function buildSnapshot(docs: { id: string; data: Record<string, unknown> }[]): { id: string }[] {
    return docs.map((d) => ({ id: d.id, ...d.data }));
  }

  it("collection-wide query receives pending set", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "new" })]);
    const result = overlay.mergeQuery(emptySnap, metadata());
    expect(result).toEqual([{ id: "a", text: "new" }]);
  });

  it("collection-wide query removes pending delete", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a")]);
    const snap = buildSnapshot([{ id: "a", data: { text: "old" } }]);
    const result = overlay.mergeQuery(snap, metadata());
    expect(result).toEqual([]);
  });

  it("collection-wide query reflects pending update", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("a", { text: "new" })]);
    const snap = buildSnapshot([{ id: "a", data: { text: "old" } }]);
    const result = overlay.mergeQuery(snap, metadata());
    expect(result).toEqual([{ id: "a", text: "new" }]);
  });

  it("where(==) filter includes matching pending set", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { parentId: "p", text: "x" })]);
    const result = overlay.mergeQuery(emptySnap, metadata({ filters: [where("parentId", "==", "p")] }));
    expect(result).toEqual([{ id: "a", parentId: "p", text: "x" }]);
  });

  it("where(==) filter excludes non-matching pending set", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { parentId: "other", text: "x" })]);
    const result = overlay.mergeQuery(emptySnap, metadata({ filters: [where("parentId", "==", "p")] }));
    expect(result).toEqual([]);
  });

  it("update can move document into query result", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("a", { parentId: "p" })]);
    const snap = buildSnapshot([{ id: "a", data: { parentId: "other", text: "x" } }]);
    const result = overlay.mergeQuery(snap, metadata({ filters: [where("parentId", "==", "p")] }));
    expect(result).toEqual([{ id: "a", parentId: "p", text: "x" }]);
  });

  it("dotted update can move document into nested-field query result", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("a", { "nested.status": "open" })]);
    const snap = buildSnapshot([{ id: "a", data: { nested: { status: "closed" }, text: "x" } }]);
    const result = overlay.mergeQuery(snap, metadata({ filters: [where("nested.status", "==", "open")] }));
    expect(result).toEqual([{ id: "a", nested: { status: "open" }, text: "x" }]);
  });

  it("update can move document into query result using acknowledged base", () => {
    const overlay = createOptimisticOverlay();
    overlay.acknowledgeDocument("__overlayTest__/a", { parentId: "other", text: "x" });
    overlay.apply("b1", [updateMutation("a", { parentId: "p" })]);
    const result = overlay.mergeQuery(emptySnap, metadata({ filters: [where("parentId", "==", "p")] }));
    expect(result).toEqual([{ id: "a", parentId: "p", text: "x" }]);
  });

  it("update can move document out of query result", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("a", { parentId: "other" })]);
    const snap = buildSnapshot([{ id: "a", data: { parentId: "p", text: "x" } }]);
    const result = overlay.mergeQuery(snap, metadata({ filters: [where("parentId", "==", "p")] }));
    expect(result).toEqual([]);
  });

  it("clears committed overlay after an update moves a doc out of a filtered query", () => {
    const overlay = createOptimisticOverlay();
    overlay.acknowledgeDocument("__overlayTest__/a", { parentId: "p", text: "x" });
    overlay.apply("b1", [updateMutation("a", { parentId: "other" })]);
    overlay.markCommitted("b1");

    expect(overlay.mergeQuery(emptySnap, metadata({ filters: [where("parentId", "==", "p")] }))).toEqual([]);

    const later = overlay.mergeDocument("__overlayTest__", "a", {
      id: "a",
      parentId: "server",
      text: "server",
    });
    expect(later).toEqual({ id: "a", parentId: "server", text: "server" });
  });

  it("delete removes from result regardless of filter", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a")]);
    const snap = buildSnapshot([{ id: "a", data: { parentId: "p" } }]);
    const result = overlay.mergeQuery(snap, metadata({ filters: [where("parentId", "==", "p")] }));
    expect(result).toEqual([]);
  });

  it("does not let a stale committed filtered delete hide a same-id server recreation", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a")]);
    overlay.markCommitted("b1");

    const result = overlay.mergeQuery(
      [{ id: "a", parentId: "p", text: "recreated" }],
      metadata({ filters: [where("parentId", "==", "p")] }),
    );
    expect(result).toEqual([{ id: "a", parentId: "p", text: "recreated" }]);
  });

  it("nested-field where evaluates", () => {
    const overlay = createOptimisticOverlay();
    const m: OverlayMutation = {
      type: "set",
      batchId: "",
      collection: "__overlayNgramTest__",
      id: "n1",
      path: "__overlayNgramTest__/n1",
      data: { ngramMap: { foo: true } },
    };
    overlay.apply("b1", [m]);
    const result = overlay.mergeQuery<{ ngramMap: Partial<Record<string, true>> }>([], {
      collection: "__overlayNgramTest__",
      filters: [where("ngramMap.foo", "==", true)],
      orderBys: [],
    });
    expect(result).toEqual([{ id: "n1", ngramMap: { foo: true } }]);
  });

  it("range filters >= and <= combine", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("low", { value: 1 }),
      setMutation("mid", { value: 5 }),
      setMutation("high", { value: 10 }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({
      filters: [where("value", ">=", 2), where("value", "<=", 8)],
      orderBys: [orderBy("value")],
    }));
    expect(result.map((r) => r.id)).toEqual(["mid"]);
  });

  it("strict range filters > and < combine", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("low", { value: 2 }),
      setMutation("mid", { value: 5 }),
      setMutation("high", { value: 8 }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({
      filters: [where("value", ">", 2), where("value", "<", 8)],
      orderBys: [orderBy("value")],
    }));
    expect(result.map((r) => r.id)).toEqual(["mid"]);
  });

  it("multiple where clauses combine with AND", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", { parentId: "p", value: 1 }),
      setMutation("b", { parentId: "p", value: 2 }),
      setMutation("c", { parentId: "q", value: 1 }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({
      filters: [where("parentId", "==", "p"), where("value", "==", 2)],
    }));
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("orderBy asc sorts ascending", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", { order: "c" }),
      setMutation("b", { order: "a" }),
      setMutation("c", { order: "b" }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({ orderBys: [orderBy("order")] }));
    expect(result.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("limit is applied after overlay merge and ordering", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", { order: "a", text: "first" }),
      setMutation("b", { order: "b", text: "second" }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({ orderBys: [orderBy("order")], limit: 1 }));
    expect(result).toEqual([{ id: "a", order: "a", text: "first" }]);
  });

  it("limited query can add an overlay doc before the Firestore-limited snapshot", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("overlay", { order: "a", text: "first" })]);
    const result = overlay.mergeQuery(
      [{ id: "server", order: "b", text: "second" }],
      metadata({ orderBys: [orderBy("order")], limit: 1 }),
    );
    expect(result).toEqual([{ id: "overlay", order: "a", text: "first" }]);
  });

  it("limited query slices an overlay doc that sorts after the Firestore-limited snapshot", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("overlay", { order: "z", text: "last" })]);
    const result = overlay.mergeQuery(
      [{ id: "server", order: "a", text: "first" }],
      metadata({ orderBys: [orderBy("order")], limit: 1 }),
    );
    expect(result).toEqual([{ id: "server", order: "a", text: "first" }]);
  });

  it("limited query applies delete to a snapshot doc and fills from over-fetched backfill", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("server")]);
    const snapshot = [
      { id: "server", order: "a", text: "first" },
      { id: "backfill", order: "b", text: "second" },
    ];
    const result = overlay.mergeQuery(snapshot, metadata({ orderBys: [orderBy("order")], limit: 1 }));
    expect(result).toEqual([{ id: "backfill", order: "b", text: "second" }]);
  });

  it("limited query applies query-shape update to a snapshot doc and recalculates the limit", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("server", { order: "z" })]);
    const snapshot = [
      { id: "server", order: "a", text: "first" },
      { id: "backfill", order: "b", text: "second" },
      { id: "extra", order: "c", text: "third" },
    ];
    const result = overlay.mergeQuery(snapshot, metadata({ orderBys: [orderBy("order")], limit: 1 }));
    expect(result).toEqual([{ id: "backfill", order: "b", text: "second" }]);
  });

  it("limited query applies update to a snapshot doc when query membership and ordering are unchanged", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("server", { text: "updated" })]);
    const result = overlay.mergeQuery(
      [{ id: "server", order: "a", text: "first" }],
      metadata({ orderBys: [orderBy("order")], limit: 1 }),
    );
    expect(result).toEqual([{ id: "server", order: "a", text: "updated" }]);
  });

  it("limited query applies filter-shape update to a snapshot doc and fills from over-fetched backfill", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [updateMutation("server", { parentId: "other" })]);
    const snapshot = [
      { id: "server", parentId: "p", order: "a", text: "first" },
      { id: "backfill", parentId: "p", order: "b", text: "second" },
    ];
    const result = overlay.mergeQuery(
      snapshot,
      metadata({ filters: [where("parentId", "==", "p")], orderBys: [orderBy("order")], limit: 1 }),
    );
    expect(result).toEqual([{ id: "backfill", parentId: "p", order: "b", text: "second" }]);
  });

  it("limited query returns only the over-fetched window when more than two hidden docs need backfill", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a"), deleteMutation("b"), deleteMutation("c")]);
    const snapshot = [
      { id: "a", order: "a", text: "first" },
      { id: "b", order: "b", text: "second" },
      { id: "c", order: "c", text: "third" },
    ];

    const result = overlay.mergeQuery(snapshot, metadata({ orderBys: [orderBy("order")], limit: 1 }));

    expect(result).toEqual([]);
  });

  it("orderBy desc sorts descending", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", { order: "c" }),
      setMutation("b", { order: "a" }),
      setMutation("c", { order: "b" }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({ orderBys: [orderBy("order", "desc")] }));
    expect(result.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("orderBy desc uses descending document id as final tie-breaker", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", { order: "same" }),
      setMutation("b", { order: "same" }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({ orderBys: [orderBy("order", "desc")] }));
    expect(result.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it('orderBy("__name__") sorts by document id ascending', () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("c", { text: "c" }),
      setMutation("a", { text: "a" }),
      setMutation("b", { text: "b" }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({ orderBys: [orderBy("__name__")] }));
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it('orderBy("__name__", "desc") sorts by document id descending', () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", { text: "a" }),
      setMutation("c", { text: "c" }),
      setMutation("b", { text: "b" }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({ orderBys: [orderBy("__name__", "desc")] }));
    expect(result.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it('does not apply an extra tie-breaker when orderBy("__name__") already differs', () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("b", { order: "same" }),
      setMutation("a", { order: "same" }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({
      orderBys: [orderBy("order"), orderBy("__name__")],
    }));
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("uses the last orderBy direction for final document id tie-breaker", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", { parentId: "p", order: "same" }),
      setMutation("b", { parentId: "p", order: "same" }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({
      orderBys: [orderBy("parentId", "desc"), orderBy("order")],
    }));
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("multiple orderBys are applied in order", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", { parentId: "p", order: "1" }),
      setMutation("b", { parentId: "q", order: "1" }),
      setMutation("c", { parentId: "p", order: "2" }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({
      orderBys: [orderBy("parentId"), orderBy("order")],
    }));
    expect(result.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("ties are broken by id ascending", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("c", { value: 1 }),
      setMutation("a", { value: 1 }),
      setMutation("b", { value: 1 }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({ orderBys: [orderBy("value")] }));
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("missing field on filter is excluded", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "x" })]);
    const result = overlay.mergeQuery(emptySnap, metadata({ filters: [where("parentId", "==", "p")] }));
    expect(result).toEqual([]);
  });

  it("missing field on orderBy is excluded like Firestore", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", { value: 1 }),
      setMutation("b", {}),
      setMutation("c", { value: 2 }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({ orderBys: [orderBy("value")] }));
    expect(result.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("hasUntrackedConstraints returns the snapshot without applying overlay", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "pending" })]);
    const snapshot = buildSnapshot([{ id: "server", data: { text: "server" } }]);
    const result = overlay.mergeQuery(snapshot, metadata({ hasUntrackedConstraints: true }));
    expect(result).toEqual([{ id: "server", text: "server" }]);
  });

  it("committed collection-wide delete is cleared when the server query no longer contains the doc", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [deleteMutation("a")]);
    overlay.markCommitted("b1");

    expect(overlay.mergeQuery(emptySnap, metadata())).toEqual([]);

    const recreated = overlay.mergeDocument("__overlayTest__", "a", { id: "a", text: "recreated" });
    expect(recreated).toEqual({ id: "a", text: "recreated" });
  });

  it("Timestamp values compared via valueOf", () => {
    const overlay = createOptimisticOverlay();
    const m1: OverlayMutation = {
      type: "set",
      batchId: "",
      collection: "__overlayRangeTest__",
      id: "x",
      path: "__overlayRangeTest__/x",
      data: { ts: Timestamp.fromMillis(2000) },
    };
    const m2: OverlayMutation = {
      type: "set",
      batchId: "",
      collection: "__overlayRangeTest__",
      id: "y",
      path: "__overlayRangeTest__/y",
      data: { ts: Timestamp.fromMillis(1000) },
    };
    overlay.apply("b1", [m1, m2]);
    const result = overlay.mergeQuery(emptySnap, {
      collection: "__overlayRangeTest__",
      filters: [where("ts", ">=", Timestamp.fromMillis(0))],
      orderBys: [orderBy("ts")],
    });
    expect(result.map((r) => r.id)).toEqual(["y", "x"]);
  });

  it("null equality filter includes null and excludes missing fields", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("null-value", { value: null }),
      setMutation("missing-value", { text: "missing" }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({ filters: [where("value", "==", null)] }));
    expect(result.map((r) => r.id)).toEqual(["null-value"]);
  });

  it("NaN equality filter matches NaN values", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("nan-value", { value: Number.NaN }),
      setMutation("number-value", { value: 1 }),
    ]);
    const result = overlay.mergeQuery(emptySnap, metadata({ filters: [where("value", "==", Number.NaN)] }));
    expect(result.map((r) => r.id)).toEqual(["nan-value"]);
  });

  it("mixed unsupported order value types keep existing order and do not throw", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("array", { value: ["x"] }),
      setMutation("object", { value: { x: 1 } }),
      setMutation("timestamp", { value: Timestamp.fromMillis(1) }),
    ]);
    expect(() => overlay.mergeQuery(emptySnap, metadata({ orderBys: [orderBy("value")] }))).not.toThrow();
  });

  it("FieldValue sentinels in overlay data do not throw during merge and rollback", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      updateMutation("a", {
        updatedAt: serverTimestamp(),
        value: increment(1),
        removed: deleteField(),
      }),
    ]);

    expect(() =>
      overlay.mergeDocument("__overlayTest__", "a", {
        id: "a",
        value: 1,
        removed: "x",
      }),
    ).not.toThrow();

    overlay.rollback("b1", undefined);
    expect(overlay.mergeDocument("__overlayTest__", "a", { id: "a", value: 1 })).toEqual({ id: "a", value: 1 });
  });

  it("FieldValue sentinels materialize like the eventual Firestore update shape", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      updateMutation("a", {
        value: increment(3),
        removed: deleteField(),
        updatedAt: serverTimestamp(),
      }),
    ]);

    const result = overlay.mergeDocument("__overlayTest__", "a", {
      id: "a",
      value: 4,
      removed: "x",
    });

    expect(result?.value).toBe(7);
    expect(result).not.toHaveProperty("removed");
    expect((result as Record<string, unknown> | undefined)?.updatedAt).toBeInstanceOf(Timestamp);
  });

  it("FieldValue sentinels in set overlays are materialized before query filtering", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [
      setMutation("a", {
        value: increment(3),
        removed: deleteField(),
        updatedAt: serverTimestamp(),
      }),
    ]);

    const result = overlay.mergeQuery(emptySnap, metadata({ filters: [where("value", "==", 3)] }));

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("removed");
    expect(result[0].updatedAt).toBeInstanceOf(Timestamp);
  });

  it("unsupported filter op fails closed: returns snapshot only", () => {
    const overlay = createOptimisticOverlay();
    overlay.apply("b1", [setMutation("a", { text: "pending" })]);
    const snap = buildSnapshot([{ id: "z", data: { text: "server" } }]);
    const result = overlay.mergeQuery(snap, metadata({
      filters: [where("text", "in", ["server"])],
    }));
    expect(result).toEqual([{ id: "z", text: "server" }]);
  });

  it("unsupported filter op warning is emitted only once per field and op", () => {
    const overlay = createOptimisticOverlay();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      overlay.apply("b1", [setMutation("a", { text: "pending" })]);
      const meta = metadata({ filters: [where("text", "array-contains", "pending")] });
      overlay.mergeQuery(emptySnap, meta);
      overlay.mergeQuery(emptySnap, meta);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("does not mix mutations from a different collection", () => {
    const overlay = createOptimisticOverlay();
    const otherCollection: OverlayMutation = {
      type: "set",
      batchId: "",
      collection: "__overlayTestOther__",
      id: "x",
      path: "__overlayTestOther__/x",
      data: { text: "other" },
    };
    overlay.apply("b1", [otherCollection, setMutation("a", { text: "in-overlay" })]);
    const result = overlay.mergeQuery(emptySnap, metadata());
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });
});
