import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { acquireEmulator, releaseEmulator } from "@/test";
import { buildNgramDoc } from "@/writeContract/ngramDoc";
import { type OpDeps, sentinelDate } from "@/writeContract/ops/shared";
import { startLifeLog } from "@/writeContract/ops/start";
import { stopLifeLog } from "@/writeContract/ops/stop";
import { switchLifeLog } from "@/writeContract/ops/switch";
import { listSwitchCandidates } from "@/writeContract/ops/switchCandidates";
import { runInTransaction, runQuery } from "@/writeContract/rest/transaction";
import { decodeFields, encodeFields } from "@/writeContract/rest/value";
import { documentName, setRawFields, updateWithTimestamp } from "@/writeContract/rest/write";

let emulatorPort: number;
let clockMs: number;

const BASE_MS = Date.parse("2026-07-10T12:00:00.000Z");

function idOf(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

// Each test gets its own project namespace so the batchVersion/editHistoryHead
// singletons start empty without cross-test clearing.
function makeDeps(project: string): OpDeps {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    baseUrl: `http://localhost:${emulatorPort}/v1/projects/${project}/databases/(default)/documents`,
    projectId: project,
    authHeader: "Bearer owner",
    now: () => clockMs,
  };
}

// Test scaffolding: give an existing entry some text and its ngram doc, the way
// the Web saveText would — bypassing the contract (no editHistory) since this is
// only setting up a source to switch from / a candidate to list.
async function seedText(deps: OpDeps, id: string, text: string): Promise<void> {
  const ngram = buildNgramDoc("lifeLogs", id, text);
  const writes = [
    updateWithTimestamp(documentName(deps.projectId, "lifeLogs", id), { text: { stringValue: text } }),
    ...(ngram.action === "set"
      ? [setRawFields(documentName(deps.projectId, "ngrams", ngram.ngramId), encodeFields(ngram.data))]
      : []),
  ];
  await runInTransaction(deps, () => Promise.resolve({ writes, value: undefined }));
}

interface Dump {
  lifeLogs: Record<string, unknown>[];
  editHistory: Record<string, unknown>[];
  editHistoryHead: Record<string, unknown> | undefined;
  batchVersion: Record<string, unknown> | undefined;
  ngrams: Record<string, unknown>[];
}

async function dump(deps: OpDeps): Promise<Dump> {
  const query = async (collection: string) => {
    const docs = await runQuery(deps, undefined, { from: [{ collectionId: collection }] });
    return docs.map((doc) => ({ id: idOf(doc.name), ...decodeFields(doc.fields) }));
  };
  return {
    lifeLogs: await query("lifeLogs"),
    editHistory: await query("editHistory"),
    ngrams: await query("ngrams"),
    editHistoryHead: (await query("editHistoryHead"))[0],
    batchVersion: (await query("batchVersion"))[0],
  };
}

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

describe("lifeLog REST ops against the emulator", () => {
  it("start on an empty timeline creates the first entry and full contract", async () => {
    const deps = makeDeps(`start-empty-${Date.now()}`);
    clockMs = BASE_MS;

    const result = await startLifeLog(deps);
    expect(result.ok).toBe(true);

    const state = await dump(deps);
    expect(state.lifeLogs).toHaveLength(1);
    expect(state.lifeLogs[0]).toMatchObject({
      id: result.id,
      text: "",
      hasTreeNodes: false,
      startAt: new Date(BASE_MS),
      endAt: sentinelDate(),
    });
    expect(state.lifeLogs[0].createdAt).toBeInstanceOf(Date);
    expect(state.lifeLogs[0].updatedAt).toBeInstanceOf(Date);

    expect(state.editHistory).toHaveLength(1);
    const entry = state.editHistory[0];
    expect(entry.description).toBe("LifeLog作成");
    expect(entry.parentId).toBe("");
    expect(entry.prevSelection).toEqual({});
    expect(entry.nextSelection).toEqual({ lifeLogs: result.id });
    expect(entry.operations).toEqual([
      {
        type: "set",
        collection: "lifeLogs",
        id: result.id,
        data: { text: "", hasTreeNodes: false, startAt: new Date(BASE_MS), endAt: sentinelDate() },
      },
    ]);
    expect(entry.inverseOperations).toEqual([{ type: "delete", collection: "lifeLogs", id: result.id }]);

    expect(state.editHistoryHead?.entryId).toBe(entry.id);
    expect(state.batchVersion?.prevVersion).toBe("");
    expect(typeof state.batchVersion?.version).toBe("string");
    expect(state.ngrams).toEqual([]);
  });

  it("start chains the next entry's startAt from the previous closed entry's endAt", async () => {
    const deps = makeDeps(`start-chain-${Date.now()}`);
    clockMs = BASE_MS;
    const first = await startLifeLog(deps);

    clockMs = BASE_MS + 60_000;
    await stopLifeLog(deps);

    clockMs = BASE_MS + 120_000;
    const second = await startLifeLog(deps);

    const state = await dump(deps);
    const secondDoc = state.lifeLogs.find((l) => l.id === second.id);
    expect(secondDoc?.startAt).toEqual(new Date(BASE_MS + 60_000));
    expect(secondDoc?.endAt).toEqual(sentinelDate());
    expect(state.lifeLogs.find((l) => l.id === first.id)?.endAt).toEqual(new Date(BASE_MS + 60_000));
  });

  it("stop closes the open entry and records the inverse that restores the sentinel", async () => {
    const deps = makeDeps(`stop-${Date.now()}`);
    clockMs = BASE_MS;
    const started = await startLifeLog(deps);

    clockMs = BASE_MS + 30_000;
    const stopped = await stopLifeLog(deps);
    expect(stopped).toEqual({ ok: true, id: started.id });

    const state = await dump(deps);
    expect(state.lifeLogs[0].endAt).toEqual(new Date(BASE_MS + 30_000));

    const stopEntry = state.editHistory.find((e) => e.description === "時刻設定");
    expect(stopEntry).toBeTruthy();
    expect(stopEntry?.nextSelection).toEqual({ lifeLogs: started.id });
    expect(stopEntry?.operations).toEqual([
      { type: "update", collection: "lifeLogs", id: started.id, data: { endAt: new Date(BASE_MS + 30_000) } },
    ]);
    // The drift focus (§risk #3): the inverse endAt is the old sentinel timestamp.
    expect(stopEntry?.inverseOperations).toEqual([
      { type: "update", collection: "lifeLogs", id: started.id, data: { endAt: sentinelDate() } },
    ]);
  });

  it("stop with no open entry is a no-op 409", async () => {
    const deps = makeDeps(`stop-noopen-${Date.now()}`);
    clockMs = BASE_MS;
    await startLifeLog(deps);
    clockMs = BASE_MS + 10_000;
    await stopLifeLog(deps);

    clockMs = BASE_MS + 20_000;
    const again = await stopLifeLog(deps);
    expect(again).toEqual({ ok: false, reason: "no open entry" });

    const state = await dump(deps);
    expect(state.editHistory.filter((e) => e.description === "時刻設定")).toHaveLength(1);
  });

  it("switch stops the open entry and starts a new one carrying the source text and ngram", async () => {
    const deps = makeDeps(`switch-${Date.now()}`);
    clockMs = BASE_MS;
    const first = await startLifeLog(deps);
    await seedText(deps, first.id, "ネットサーフィン");

    clockMs = BASE_MS + 45_000;
    const switched = await switchLifeLog(deps, { sourceId: first.id });
    expect(switched.ok).toBe(true);
    if (!switched.ok) throw new Error("unreachable");
    expect(switched.stoppedId).toBe(first.id);

    const state = await dump(deps);
    expect(state.lifeLogs.find((l) => l.id === first.id)?.endAt).toEqual(new Date(BASE_MS + 45_000));
    const newDoc = state.lifeLogs.find((l) => l.id === switched.id);
    expect(newDoc?.text).toBe("ネットサーフィン");
    expect(newDoc?.startAt).toEqual(new Date(BASE_MS + 45_000));
    expect(newDoc?.endAt).toEqual(sentinelDate());

    const switchEntry = state.editHistory.find((e) => e.description === "切り替え");
    expect(switchEntry?.nextSelection).toEqual({ lifeLogs: switched.id });
    expect(switchEntry?.operations).toEqual([
      { type: "update", collection: "lifeLogs", id: first.id, data: { endAt: new Date(BASE_MS + 45_000) } },
      {
        type: "set",
        collection: "lifeLogs",
        id: switched.id,
        data: {
          text: "ネットサーフィン",
          hasTreeNodes: false,
          startAt: new Date(BASE_MS + 45_000),
          endAt: sentinelDate(),
        },
      },
    ]);
    expect(switchEntry?.inverseOperations).toEqual([
      { type: "delete", collection: "lifeLogs", id: switched.id },
      { type: "update", collection: "lifeLogs", id: first.id, data: { endAt: sentinelDate() } },
    ]);

    const newNgram = state.ngrams.find((n) => n.id === `${switched.id}lifeLogs`);
    expect(newNgram?.text).toBe("ネットサーフィン");
    expect(newNgram?.collection).toBe("lifeLogs");
  });

  it("switch with an unknown source is a no-op 404", async () => {
    const deps = makeDeps(`switch-404-${Date.now()}`);
    clockMs = BASE_MS;
    await startLifeLog(deps);
    const result = await switchLifeLog(deps, { sourceId: "does-not-exist" });
    expect(result).toEqual({ ok: false, reason: "source not found" });
  });

  it("switch-candidates dedupes by text, keeps the newest, and skips open/empty entries", async () => {
    const deps = makeDeps(`candidates-${Date.now()}`);
    clockMs = BASE_MS;
    const a1 = await startLifeLog(deps);
    await seedText(deps, a1.id, "A");
    clockMs = BASE_MS + 10_000;
    await stopLifeLog(deps);

    clockMs = BASE_MS + 20_000;
    const b1 = await startLifeLog(deps);
    await seedText(deps, b1.id, "B");
    clockMs = BASE_MS + 30_000;
    await stopLifeLog(deps);

    clockMs = BASE_MS + 40_000;
    const a2 = await startLifeLog(deps);
    await seedText(deps, a2.id, "A");
    clockMs = BASE_MS + 50_000;
    await stopLifeLog(deps);

    clockMs = BASE_MS + 60_000;
    await startLifeLog(deps);

    const { candidates } = await listSwitchCandidates(deps);
    expect(candidates.map((c) => c.text)).toEqual(["A", "B"]);
    expect(candidates.find((c) => c.text === "A")?.id).toBe(a2.id);
  });
});
