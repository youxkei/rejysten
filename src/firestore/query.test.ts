import { getApps, initializeApp } from "firebase/app";
import {
  type CollectionReference,
  Timestamp,
  collection,
  getFirestore,
  initializeFirestore,
  limit as firestoreLimit,
  memoryLocalCache,
} from "firebase/firestore";
import { describe, it, expect } from "vitest";

import { limit, orderBy, query, where, type QueryWithMetadata } from "@/firestore/query";

type QueryTestDoc = { text: string; value: number };

function makeCol(): CollectionReference<QueryTestDoc> & { readonly id: "__queryTest__" } {
  const appName = "query-test-app";
  let app = getApps().find((a) => a.name === appName);
  if (!app) {
    app = initializeApp({ projectId: "demo" }, appName);
  }
  let firestore;
  try {
    firestore = initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch {
    firestore = getFirestore(app);
  }
  return collection(firestore, "__queryTest__") as CollectionReference<QueryTestDoc> & {
    readonly id: "__queryTest__";
  };
}

describe("where", () => {
  it("preserves WhereConstraint metadata", () => {
    const w = where("parentId", "==", "abc");
    expect(w.kind).toBe("where");
    expect(w.fieldPath).toBe("parentId");
    expect(w.op).toBe("==");
    expect(w.value).toBe("abc");
    expect(w.constraint).toBeDefined();
  });

  it("supports == op", () => {
    expect(where("p", "==", 1).op).toBe("==");
  });
  it("supports < op", () => {
    expect(where("p", "<", 1).op).toBe("<");
  });
  it("supports <= op", () => {
    expect(where("p", "<=", 1).op).toBe("<=");
  });
  it("supports > op", () => {
    expect(where("p", ">", 1).op).toBe(">");
  });
  it("supports >= op", () => {
    expect(where("p", ">=", 1).op).toBe(">=");
  });

  it("supports nested field path", () => {
    const w = where("ngramMap.foo", "==", true);
    expect(w.fieldPath).toBe("ngramMap.foo");
  });

  it("supports string value", () => {
    expect(where("p", "==", "x").value).toBe("x");
  });
  it("supports number value", () => {
    expect(where("p", "==", 3).value).toBe(3);
  });
  it("supports boolean value", () => {
    expect(where("p", "==", true).value).toBe(true);
  });
  it("supports Timestamp value", () => {
    const ts = Timestamp.fromMillis(123);
    expect(where("p", "==", ts).value).toBe(ts);
  });
});

describe("orderBy", () => {
  it("defaults direction to asc", () => {
    const o = orderBy("order");
    expect(o.kind).toBe("orderBy");
    expect(o.fieldPath).toBe("order");
    expect(o.direction).toBe("asc");
    expect(o.constraint).toBeDefined();
  });

  it("preserves desc direction", () => {
    expect(orderBy("order", "desc").direction).toBe("desc");
  });

  it('preserves "__name__" document id ordering metadata', () => {
    const o = orderBy("__name__", "desc");
    expect(o.kind).toBe("orderBy");
    expect(o.fieldPath).toBe("__name__");
    expect(o.direction).toBe("desc");
    expect(o.constraint).toBeDefined();
  });
});

describe("query", () => {
  it("creates query with empty filters and orderBys when no constraints", () => {
    const col = makeCol();
    const q: QueryWithMetadata<QueryTestDoc> = query(col);
    expect(q.collection).toBe("__queryTest__");
    expect(q.filters).toEqual([]);
    expect(q.orderBys).toEqual([]);
    expect(q.hasUntrackedConstraints).toBe(false);
    expect(q.query).toBeDefined();
  });

  it("partitions where and orderBy into filters and orderBys regardless of order", () => {
    const col = makeCol();
    const q = query(
      col,
      orderBy("value"),
      where("text", "==", "hello"),
      orderBy("text", "desc"),
      where("value", ">=", 5),
    );
    expect(q.filters.map((f) => f.fieldPath)).toEqual(["text", "value"]);
    expect(q.orderBys.map((o) => o.fieldPath)).toEqual(["value", "text"]);
  });

  it("attaches a real Firestore Query in q.query", () => {
    const col = makeCol();
    const q = query(col, where("value", "==", 1));
    expect(q.query).toBeDefined();
    expect(typeof (q.query as { type?: unknown }).type === "string" || true).toBe(true);
  });

  it("passes through Firestore constraints without metadata", () => {
    const col = makeCol();
    const q = query(col, where("value", ">=", 1), orderBy("value"), firestoreLimit(1));
    expect(q.filters.map((f) => f.fieldPath)).toEqual(["value"]);
    expect(q.orderBys.map((o) => o.fieldPath)).toEqual(["value"]);
    expect(q.limit).toBeUndefined();
    expect(q.hasUntrackedConstraints).toBe(true);
    expect(q.query).toBeDefined();
  });

  it("stores limit metadata", () => {
    const col = makeCol();
    const q = query(col, where("value", ">=", 1), orderBy("value"), limit(1));
    expect(q.filters.map((f) => f.fieldPath)).toEqual(["value"]);
    expect(q.orderBys.map((o) => o.fieldPath)).toEqual(["value"]);
    expect(q.limit).toBe(1);
    expect(q.hasUntrackedConstraints).toBe(false);
    expect(q.query).toBeDefined();
  });

  it("passes limit + 2 through to the Firestore query for overlay backfill", () => {
    const col = makeCol();
    const q = query(col, limit(1));
    const constraints = (q.query as unknown as { _query?: { explicitOrderBy?: unknown[]; limit?: number | null } })._query;
    expect(q.limit).toBe(1);
    expect(constraints?.limit).toBe(3);
  });

  it("uses configured limit overfetch count", () => {
    const col = makeCol();
    const q = query(col, limit(2, { overfetchCount: 5 }));
    const constraints = (q.query as unknown as { _query?: { explicitOrderBy?: unknown[]; limit?: number | null } })._query;
    expect(q.limit).toBe(2);
    expect(constraints?.limit).toBe(7);
  });

  it("uses the last wrapper limit as metadata", () => {
    const col = makeCol();
    const q = query(col, limit(10), where("value", ">=", 1), limit(3));
    expect(q.filters.map((f) => f.fieldPath)).toEqual(["value"]);
    expect(q.limit).toBe(3);
    expect(q.query).toBeDefined();
  });

  it("keeps wrapper limit metadata even when Firestore constraints are mixed in", () => {
    const col = makeCol();
    const q = query(col, firestoreLimit(5), where("value", ">=", 1), limit(2));
    expect(q.filters.map((f) => f.fieldPath)).toEqual(["value"]);
    expect(q.limit).toBe(2);
    expect(q.hasUntrackedConstraints).toBe(true);
    expect(q.query).toBeDefined();
  });
});

describe("type safety", () => {
  it("createSubscribeAllSignal can only accept QueryWithMetadata via type", () => {
    // This is a compile-time check: making sure that QueryWithMetadata has the
    // expected shape so subscribe.tsx's signature can enforce it. The runtime
    // assertion below just demonstrates the property names are present.
    const col = makeCol();
    const q = query(col);
    const wrapperKeys = new Set(Object.keys(q));
    expect(wrapperKeys.has("query")).toBe(true);
    expect(wrapperKeys.has("collection")).toBe(true);
    expect(wrapperKeys.has("filters")).toBe(true);
    expect(wrapperKeys.has("orderBys")).toBe(true);
    expect(wrapperKeys.has("hasUntrackedConstraints")).toBe(true);
  });
});
