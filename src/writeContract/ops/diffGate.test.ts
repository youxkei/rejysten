import { collection, doc, Timestamp } from "firebase/firestore";
import { createRoot, createSignal } from "solid-js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  singletonDocumentId,
  type FirestoreService,
  type SchemaCollectionReference,
} from "@/services/firebase/firestore";
import { runBatch, waitForPendingCommitsForTest } from "@/services/firebase/firestore/batch";
import { createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { createTestFirestoreService } from "@/services/firebase/firestore/test";
import { acquireEmulator, releaseEmulator } from "@/test";
import { noneTimestamp } from "@/timestamp";
import { type OpDeps } from "@/writeContract/ops/shared";
import { startLifeLog } from "@/writeContract/ops/start";
import { stopLifeLog } from "@/writeContract/ops/stop";
import { runQuery } from "@/writeContract/rest/transaction";
import { decodeFields } from "@/writeContract/rest/value";
import "@/panes/lifeLogs/schema";

let emulatorPort: number;
let webSvc: FirestoreService;
let disposeRoot: (() => void) | undefined;

const BASE_MS = Date.parse("2026-07-10T12:00:00.000Z");
const WEB_PROJECT = "demo";

function restConfig(project: string, now: () => number): OpDeps {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    baseUrl: `http://localhost:${emulatorPort}/v1/projects/${project}/databases/(default)/documents`,
    projectId: project,
    authHeader: "Bearer owner",
    now,
  };
}

function idOf(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

// Reads back a project's editHistory entries and lifeLogs docs via REST, so both
// paths are compared through one decode path.
async function readBack(project: string) {
  const deps = restConfig(project, () => BASE_MS);
  const query = async (collectionId: string): Promise<Record<string, unknown>[]> => {
    const docs = await runQuery(deps, undefined, { from: [{ collectionId }] });
    return docs.map((d) => ({ id: idOf(d.name), ...decodeFields(d.fields) }));
  };
  return { lifeLogs: await query("lifeLogs"), editHistory: await query("editHistory") };
}

// Server timestamps and every uuid (doc ids, the id embedded in ops/selection)
// are normalized away; the business shape is what must match.
function normalizeEntry(entry: Record<string, unknown>, lifeLogId: string): unknown {
  const json = JSON.stringify(
    {
      description: entry.description,
      operations: entry.operations,
      inverseOperations: entry.inverseOperations,
      prevSelection: entry.prevSelection,
      nextSelection: entry.nextSelection,
    },
    (key: string, value: unknown) => (key === "createdAt" || key === "updatedAt" ? undefined : value),
  );
  return JSON.parse(json.split(lifeLogId).join("<ID>")) as unknown;
}

function normalizeLifeLog(life: Record<string, unknown>): unknown {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = life;
  return rest;
}

async function clearProject(project: string): Promise<void> {
  await globalThis.fetch(
    `http://localhost:${emulatorPort}/emulator/v1/projects/${project}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
  await clearProject(WEB_PROJECT);

  const testService = createTestFirestoreService(emulatorPort, "diff-gate", { useMemoryCache: true });
  await new Promise<void>((resolve) => {
    createRoot((dispose) => {
      disposeRoot = dispose;

      const batchVersionCol = collection(
        testService.firestore,
        "batchVersion",
      ) as SchemaCollectionReference<"batchVersion">;
      const editHistoryHeadCol = collection(
        testService.firestore,
        "editHistoryHead",
      ) as SchemaCollectionReference<"editHistoryHead">;

      const [clock$] = createSignal(false);
      let lock = false;

      webSvc = {
        firestore: testService.firestore,
        firestoreClient: testService.firestoreClient,
        clock$,
        setClock: () => undefined,
        batchVersion$: () => undefined,
        editHistoryHead$: () => undefined,
        services: {
          firebase: {} as FirestoreService["services"]["firebase"],
          store: {
            state: {
              servicesFirestoreBatch: {
                get lock() {
                  return lock;
                },
                set lock(v: boolean) {
                  lock = v;
                },
              },
            },
            updateState: (fn: (s: { servicesFirestoreBatch: { lock: boolean } }) => void) => {
              fn(webSvc.services.store.state);
            },
          } as FirestoreService["services"]["store"],
        },
      };

      webSvc.batchVersion$ = createSubscribeSignal(webSvc, () => doc(batchVersionCol, singletonDocumentId));
      webSvc.editHistoryHead$ = createSubscribeSignal(webSvc, () => doc(editHistoryHeadCol, singletonDocumentId));

      resolve();
    });
  });
});

afterAll(async () => {
  disposeRoot?.();
  await releaseEmulator(emulatorPort);
});

describe("Web vs REST commit equivalence (drift gate)", () => {
  it("start then stop produce the same editHistory entries and lifeLog doc on both paths", async () => {
    const lifeLogsCol = collection(webSvc.firestore, "lifeLogs") as SchemaCollectionReference<"lifeLogs">;
    const webId = "web-entry-1";
    const startAt = Timestamp.fromMillis(BASE_MS);
    const stopAt = Timestamp.fromMillis(BASE_MS + 30_000);

    // --- Web path (project "demo"), driven with the Worker's selection convention. ---
    await runBatch(
      webSvc,
      (batch) => {
        batch.set(lifeLogsCol, { id: webId, text: "", hasTreeNodes: false, startAt, endAt: noneTimestamp });
        return Promise.resolve();
      },
      { description: "LifeLog作成", prevSelection: {}, nextSelection: { lifeLogs: webId } },
    );
    await waitForPendingCommitsForTest({ service: webSvc });

    await runBatch(
      webSvc,
      (batch) => {
        batch.update(lifeLogsCol, { id: webId, endAt: stopAt });
        return Promise.resolve();
      },
      { description: "時刻設定", prevSelection: {}, nextSelection: { lifeLogs: webId } },
    );
    await waitForPendingCommitsForTest({ service: webSvc });

    // --- REST path (isolated project). ---
    const restProject = `diff-rest-${Date.now()}`;
    let clockMs = BASE_MS;
    const deps = restConfig(restProject, () => clockMs);
    const started = await startLifeLog(deps);
    clockMs = BASE_MS + 30_000;
    await stopLifeLog(deps);

    // --- Compare. ---
    const web = await readBack(WEB_PROJECT);
    const rest = await readBack(restProject);

    const webCreate = web.editHistory.find((e) => e.description === "LifeLog作成")!;
    const restCreate = rest.editHistory.find((e) => e.description === "LifeLog作成")!;
    expect(normalizeEntry(restCreate, started.id)).toEqual(normalizeEntry(webCreate, webId));

    const webStop = web.editHistory.find((e) => e.description === "時刻設定")!;
    const restStop = rest.editHistory.find((e) => e.description === "時刻設定")!;
    expect(normalizeEntry(restStop, started.id)).toEqual(normalizeEntry(webStop, webId));

    const webLifeLog = web.lifeLogs.find((l) => l.id === webId)!;
    const restLifeLog = rest.lifeLogs.find((l) => l.id === started.id)!;
    expect(normalizeLifeLog(restLifeLog)).toEqual(normalizeLifeLog(webLifeLog));
  });
});
