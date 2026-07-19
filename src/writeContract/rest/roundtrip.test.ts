import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { acquireEmulator, releaseEmulator } from "@/test";
import { batchGet, runInTransaction, runQuery } from "@/writeContract/rest/transaction";
import { type RestConfig } from "@/writeContract/rest/types";
import { decodeFields, fromValue, toValue } from "@/writeContract/rest/value";
import { documentName, setRawFields, writeOpToWrite } from "@/writeContract/rest/write";
import { type WriteOp } from "@/writeContract/types";

let config: RestConfig;
let emulatorPort: number;

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
  config = {
    fetch: globalThis.fetch.bind(globalThis),
    baseUrl: `http://localhost:${emulatorPort}/v1/projects/demo/databases/(default)/documents`,
    projectId: "demo",
    authHeader: "Bearer owner",
  };
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

describe("REST value encoding", () => {
  it("round-trips the value shapes the write contract uses", () => {
    const ts = new Date("2026-07-20T04:05:06.000Z");
    expect(toValue("hi")).toEqual({ stringValue: "hi" });
    expect(toValue(true)).toEqual({ booleanValue: true });
    expect(toValue(ts)).toEqual({ timestampValue: "2026-07-20T04:05:06.000Z" });
    expect(toValue({ ab: true })).toEqual({ mapValue: { fields: { ab: { booleanValue: true } } } });
    expect(toValue(["x"])).toEqual({ arrayValue: { values: [{ stringValue: "x" }] } });

    expect(fromValue({ stringValue: "hi" })).toBe("hi");
    expect(fromValue({ timestampValue: "2026-07-20T04:05:06.000Z" })).toEqual(ts);
    expect(decodeFields({ a: { stringValue: "x" }, b: { booleanValue: false } })).toEqual({ a: "x", b: false });
  });
});

describe("REST transport against the emulator", () => {
  it("writes a lifeLog document with server timestamps and reads it back", async (test) => {
    const col = `${test.task.id}_${Date.now()}`;
    const id = "doc1";
    const startAt = new Date("2026-07-20T04:00:00.000Z");
    const endAt = new Date("3000-12-31T23:59:59.000Z");

    const set: WriteOp = {
      type: "set",
      collection: col,
      id,
      data: { text: "hello", hasTreeNodes: false, startAt, endAt },
    };

    await runInTransaction(config, () => Promise.resolve({ writes: [writeOpToWrite(set, "demo")], value: undefined }));

    const read = await runInTransaction(config, async (tx) => {
      const found = await batchGet(config, tx, [documentName("demo", col, id)]);
      return { writes: null, value: found };
    });

    const fields = read.get(documentName("demo", col, id));
    expect(fields).toBeTruthy();
    const decoded = decodeFields(fields!);
    expect(decoded.text).toBe("hello");
    expect(decoded.hasTreeNodes).toBe(false);
    expect(decoded.startAt).toEqual(startAt);
    expect(decoded.endAt).toEqual(endAt);
    // Server-managed timestamps were applied by the REQUEST_TIME transforms.
    expect(decoded.createdAt).toBeInstanceOf(Date);
    expect(decoded.updatedAt).toBeInstanceOf(Date);
  });

  it("update merges masked fields and preserves the rest", async (test) => {
    const col = `${test.task.id}_${Date.now()}`;
    const id = "doc1";
    const set: WriteOp = {
      type: "set",
      collection: col,
      id,
      data: { text: "hello", hasTreeNodes: false, startAt: new Date("2026-07-20T04:00:00.000Z") },
    };
    const update: WriteOp = { type: "update", collection: col, id, data: { text: "changed" } };

    await runInTransaction(config, () => Promise.resolve({ writes: [writeOpToWrite(set, "demo")], value: undefined }));
    await runInTransaction(config, () =>
      Promise.resolve({ writes: [writeOpToWrite(update, "demo")], value: undefined }),
    );

    const read = await runInTransaction(config, async (tx) => ({
      writes: null,
      value: await batchGet(config, tx, [documentName("demo", col, id)]),
    }));
    const decoded = decodeFields(read.get(documentName("demo", col, id))!);
    expect(decoded.text).toBe("changed");
    expect(decoded.hasTreeNodes).toBe(false);
  });

  it("reports a missing document as null from batchGet", async (test) => {
    const col = `${test.task.id}_${Date.now()}`;
    const read = await runInTransaction(config, async (tx) => ({
      writes: null,
      value: await batchGet(config, tx, [documentName("demo", col, "never")]),
    }));
    expect(read.get(documentName("demo", col, "never"))).toBeNull();
  });

  it("rolls back without writing when the body returns writes: null", async (test) => {
    const col = `${test.task.id}_${Date.now()}`;
    const id = "doc1";

    await runInTransaction(config, () => Promise.resolve({ writes: null, value: undefined }));

    const read = await runInTransaction(config, async (tx) => ({
      writes: null,
      value: await batchGet(config, tx, [documentName("demo", col, id)]),
    }));
    expect(read.get(documentName("demo", col, id))).toBeNull();
  });

  it("writes raw fields with no server timestamps (ngram-style copy)", async (test) => {
    const col = `${test.task.id}_${Date.now()}`;
    const id = "ngram1";
    const fields = { collection: toValue("lifeLogs"), text: toValue("hello"), ngramMap: toValue({ he: true }) };

    await runInTransaction(config, () =>
      Promise.resolve({ writes: [setRawFields(documentName("demo", col, id), fields)], value: undefined }),
    );

    const read = await runInTransaction(config, async (tx) => ({
      writes: null,
      value: await batchGet(config, tx, [documentName("demo", col, id)]),
    }));
    const stored = read.get(documentName("demo", col, id))!;
    expect(Object.keys(stored).sort()).toEqual(["collection", "ngramMap", "text"]);
    expect(stored.createdAt).toBeUndefined();
  });

  it("runQuery returns documents ordered by the structured query", async (test) => {
    const col = "lifeLogs";
    const marker = `${test.task.id}_${Date.now()}`;
    const older: WriteOp = {
      type: "set",
      collection: col,
      id: `${marker}_older`,
      data: {
        text: marker,
        hasTreeNodes: false,
        startAt: new Date("2026-07-20T01:00:00.000Z"),
        endAt: new Date("2026-07-20T02:00:00.000Z"),
      },
    };
    const newer: WriteOp = {
      type: "set",
      collection: col,
      id: `${marker}_newer`,
      data: {
        text: marker,
        hasTreeNodes: false,
        startAt: new Date("2026-07-20T03:00:00.000Z"),
        endAt: new Date("2026-07-20T04:00:00.000Z"),
      },
    };

    await runInTransaction(config, () =>
      Promise.resolve({ writes: [writeOpToWrite(older, "demo")], value: undefined }),
    );
    await runInTransaction(config, () =>
      Promise.resolve({ writes: [writeOpToWrite(newer, "demo")], value: undefined }),
    );

    const docs = await runInTransaction(config, async (tx) => ({
      writes: null,
      value: await runQuery(config, tx, {
        from: [{ collectionId: col }],
        orderBy: [
          { field: { fieldPath: "endAt" }, direction: "DESCENDING" },
          { field: { fieldPath: "startAt" }, direction: "DESCENDING" },
        ],
        limit: 1,
      }),
    }));

    expect(docs).toHaveLength(1);
    expect(docs[0].name.endsWith(`${marker}_newer`)).toBe(true);
  });
});
