import {
  type Firestore,
  type Timestamp,
  collection,
  writeBatch,
  doc,
  query as firestoreQuery,
  where as firestoreWhere,
  serverTimestamp,
} from "firebase/firestore";
import { createEffect, createRoot, createSignal } from "solid-js";
import { describe, it, beforeAll, afterAll } from "vitest";

import {
  type Timestamps,
  type FirestoreService,
  type SchemaCollectionReference,
  getDoc,
  getDocs,
  waitForServerSync,
  singletonDocumentId,
} from "@/services/firebase/firestore";
import { createOptimisticOverlay } from "@/services/firebase/firestore/overlay";
import { limit, orderBy, query, where } from "@/services/firebase/firestore/query";
import {
  createSubscribeAllSignal,
  createSubscribeSignal,
  shouldAcknowledgeSnapshotMetadata,
} from "@/services/firebase/firestore/subscribe";
import { createTestFirestoreService, timestampForCreatedAt } from "@/services/firebase/firestore/test";
import { acquireEmulator, releaseEmulator } from "@/test";

type TestDoc = Timestamps & { text: string; value: number; tags?: string[] };

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    __subscribeTest__: { text: string; value: number; tags?: string[]; createdAt: Timestamp; updatedAt: Timestamp };
  }
}

function testCollection(fs: Firestore, name: string): SchemaCollectionReference<"__subscribeTest__"> {
  return collection(fs, name) as SchemaCollectionReference<"__subscribeTest__">;
}

let service: FirestoreService;
let firestore: Firestore;
let emulatorPort: number;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for predicate");
    }
    await wait(20);
  }
}

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
  const result = createTestFirestoreService(emulatorPort, "subscribe-test");
  const [clock$] = createSignal(false);
  service = { ...result, clock$, overlay: createOptimisticOverlay() } as FirestoreService;
  firestore = result.firestore;
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

describe("optimistic overlay", () => {
  it("createSubscribeSignal notifies once for a successful optimistic set", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_subscribe_doc_success_once`;
    const col = testCollection(firestore, tid);
    const batchId = `batch-${tid}`;

    const result = await new Promise<{ changeCount: number; latest: TestDoc | undefined }>((resolve, reject) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeSignal<TestDoc>(service, () => doc(col, "doc1"));
        let armed = false;
        let changeCount = 0;
        let latest: TestDoc | undefined;

        createEffect(() => {
          const value = signal$();
          if (!armed) return;
          changeCount++;
          latest = value;
        });

        void (async () => {
          try {
            await wait(100);
            armed = true;

            service.overlay.apply(batchId, [
              {
                type: "set",
                batchId: "",
                collection: col.id,
                id: "doc1",
                path: `${col.id}/doc1`,
                data: { text: "optimistic", value: 1 },
              },
            ]);
            await waitUntil(() => latest?.text === "optimistic");

            await writeBatch(firestore)
              .set(doc(col, "doc1"), {
                text: "optimistic",
                value: 1,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
              .commit();
            service.overlay.markCommitted(batchId);
            await getDoc(service, col, "doc1", { fromServer: true });
            await wait(300);

            resolve({ changeCount, latest });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            service.overlay.rollback(batchId, undefined);
            dispose();
          }
        })();
      });
    });

    test.expect(result.latest?.text).toBe("optimistic");
    test.expect(result.changeCount).toBe(1);
  });

  it("createSubscribeAllSignal notifies once for a successful optimistic set", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_subscribe_query_success_once`;
    const col = testCollection(firestore, tid);
    const batchId = `batch-${tid}`;

    const result = await new Promise<{ changeCount: number; latest: TestDoc[] }>((resolve, reject) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => query(col));
        let armed = false;
        let changeCount = 0;
        let latest: TestDoc[] = [];

        createEffect(() => {
          const value = signal$();
          if (!armed) return;
          changeCount++;
          latest = value;
        });

        void (async () => {
          try {
            await wait(100);
            armed = true;

            service.overlay.apply(batchId, [
              {
                type: "set",
                batchId: "",
                collection: col.id,
                id: "doc1",
                path: `${col.id}/doc1`,
                data: { text: "optimistic", value: 1 },
              },
            ]);
            await waitUntil(() => latest.length === 1 && latest[0].text === "optimistic");

            await writeBatch(firestore)
              .set(doc(col, "doc1"), {
                text: "optimistic",
                value: 1,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
              .commit();
            service.overlay.markCommitted(batchId);
            await getDocs(service, query(col), { fromServer: true });
            await wait(300);

            resolve({ changeCount, latest });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            service.overlay.rollback(batchId, undefined);
            dispose();
          }
        })();
      });
    });

    test.expect(result.latest.map((doc) => doc.text)).toEqual(["optimistic"]);
    test.expect(result.changeCount).toBe(1);
  });

  it("createSubscribeSignal notifies overlay changes while firestore clock is high", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_subscribe_doc_overlay_during_clock`;
    const col = testCollection(firestore, tid);
    const batchId = `batch-${tid}`;
    const [clock$, setClock] = createSignal(false);
    const localService = {
      ...service,
      clock$,
      setClock: (clock: boolean) => {
        setClock(clock);
      },
      overlay: createOptimisticOverlay(),
    } as FirestoreService;

    const result = await new Promise<TestDoc | undefined>((resolve, reject) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeSignal<TestDoc>(localService, () => doc(col, "doc1"));
        let latest: TestDoc | undefined;

        createEffect(() => {
          latest = signal$();
        });

        void (async () => {
          try {
            await wait(100);
            setClock(true);
            localService.overlay.apply(batchId, [
              {
                type: "set",
                batchId: "",
                collection: col.id,
                id: "doc1",
                path: `${col.id}/doc1`,
                data: { text: "optimistic", value: 1 },
              },
            ]);
            await waitUntil(() => latest?.text === "optimistic");
            resolve(latest);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            localService.overlay.rollback(batchId, undefined);
            setClock(false);
            dispose();
          }
        })();
      });
    });

    test.expect(result?.text).toBe("optimistic");
  });

  it("createSubscribeAllSignal notifies overlay changes while firestore clock is high", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_subscribe_query_overlay_during_clock`;
    const col = testCollection(firestore, tid);
    const batchId = `batch-${tid}`;
    const [clock$, setClock] = createSignal(false);
    const localService = {
      ...service,
      clock$,
      setClock: (clock: boolean) => {
        setClock(clock);
      },
      overlay: createOptimisticOverlay(),
    } as FirestoreService;

    const result = await new Promise<TestDoc[]>((resolve, reject) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeAllSignal<TestDoc>(localService, () => query(col));
        let latest: TestDoc[] = [];

        createEffect(() => {
          latest = signal$();
        });

        void (async () => {
          try {
            await wait(100);
            setClock(true);
            localService.overlay.apply(batchId, [
              {
                type: "set",
                batchId: "",
                collection: col.id,
                id: "doc1",
                path: `${col.id}/doc1`,
                data: { text: "optimistic", value: 1 },
              },
            ]);
            await waitUntil(() => latest.length === 1 && latest[0].text === "optimistic");
            resolve(latest);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            localService.overlay.rollback(batchId, undefined);
            setClock(false);
            dispose();
          }
        })();
      });
    });

    test.expect(result.map((doc) => doc.text)).toEqual(["optimistic"]);
  });

  it("createSubscribeSignal notifies once for a successful optimistic update", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_subscribe_doc_update_once`;
    const col = testCollection(firestore, tid);
    const batchId = `batch-${tid}`;
    await writeBatch(firestore)
      .set(doc(col, "doc1"), {
        text: "server",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      })
      .commit();

    const result = await new Promise<{ changeCount: number; latest: TestDoc | undefined }>((resolve, reject) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeSignal<TestDoc>(service, () => doc(col, "doc1"));
        let armed = false;
        let changeCount = 0;
        let latest: TestDoc | undefined;

        createEffect(() => {
          const value = signal$();
          latest = value;
          if (!armed) return;
          changeCount++;
        });

        void (async () => {
          try {
            await waitUntil(() => latest?.text === "server");
            armed = true;

            service.overlay.apply(batchId, [
              {
                type: "update",
                batchId: "",
                collection: col.id,
                id: "doc1",
                path: `${col.id}/doc1`,
                data: { text: "optimistic", value: 2 },
              },
            ]);
            await waitUntil(() => latest?.text === "optimistic" && latest.value === 2);

            await writeBatch(firestore)
              .update(doc(col, "doc1"), {
                text: "optimistic",
                value: 2,
                updatedAt: serverTimestamp(),
              })
              .commit();
            service.overlay.markCommitted(batchId);
            await getDoc(service, col, "doc1", { fromServer: true });
            await wait(300);

            resolve({ changeCount, latest });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            service.overlay.rollback(batchId, undefined);
            dispose();
          }
        })();
      });
    });

    test.expect(result.latest?.text).toBe("optimistic");
    test.expect(result.latest?.value).toBe(2);
    test.expect(result.changeCount).toBe(1);
  });

  it("createSubscribeAllSignal notifies once for a successful optimistic update", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_subscribe_query_update_once`;
    const col = testCollection(firestore, tid);
    const batchId = `batch-${tid}`;
    await writeBatch(firestore)
      .set(doc(col, "doc1"), {
        text: "server",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      })
      .commit();

    const result = await new Promise<{ changeCount: number; latest: TestDoc[] }>((resolve, reject) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => query(col));
        let armed = false;
        let changeCount = 0;
        let latest: TestDoc[] = [];

        createEffect(() => {
          const value = signal$();
          latest = value;
          if (!armed) return;
          changeCount++;
        });

        void (async () => {
          try {
            await waitUntil(() => latest.length === 1 && latest[0].text === "server");
            armed = true;

            service.overlay.apply(batchId, [
              {
                type: "update",
                batchId: "",
                collection: col.id,
                id: "doc1",
                path: `${col.id}/doc1`,
                data: { text: "optimistic", value: 2 },
              },
            ]);
            await waitUntil(() => latest.length === 1 && latest[0].text === "optimistic" && latest[0].value === 2);

            await writeBatch(firestore)
              .update(doc(col, "doc1"), {
                text: "optimistic",
                value: 2,
                updatedAt: serverTimestamp(),
              })
              .commit();
            service.overlay.markCommitted(batchId);
            await getDocs(service, query(col), { fromServer: true });
            await wait(300);

            resolve({ changeCount, latest });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            service.overlay.rollback(batchId, undefined);
            dispose();
          }
        })();
      });
    });

    test.expect(result.latest.map((doc) => doc.text)).toEqual(["optimistic"]);
    test.expect(result.latest[0].value).toBe(2);
    test.expect(result.changeCount).toBe(1);
  });

  it("createSubscribeSignal notifies once for a successful optimistic delete", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_subscribe_doc_delete_once`;
    const col = testCollection(firestore, tid);
    const batchId = `batch-${tid}`;
    await writeBatch(firestore)
      .set(doc(col, "doc1"), {
        text: "server",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      })
      .commit();

    const result = await new Promise<{ changeCount: number; latest: TestDoc | undefined }>((resolve, reject) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeSignal<TestDoc>(service, () => doc(col, "doc1"));
        let armed = false;
        let changeCount = 0;
        let latest: TestDoc | undefined;

        createEffect(() => {
          const value = signal$();
          latest = value;
          if (!armed) return;
          changeCount++;
        });

        void (async () => {
          try {
            await waitUntil(() => latest?.text === "server");
            armed = true;

            service.overlay.apply(batchId, [
              {
                type: "delete",
                batchId: "",
                collection: col.id,
                id: "doc1",
                path: `${col.id}/doc1`,
              },
            ]);
            await waitUntil(() => latest === undefined);

            await writeBatch(firestore).delete(doc(col, "doc1")).commit();
            service.overlay.markCommitted(batchId);
            await getDoc(service, col, "doc1", { fromServer: true });
            await wait(300);

            resolve({ changeCount, latest });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            service.overlay.rollback(batchId, undefined);
            dispose();
          }
        })();
      });
    });

    test.expect(result.latest).toBeUndefined();
    test.expect(result.changeCount).toBe(1);
  });

  it("createSubscribeAllSignal notifies once for a successful optimistic delete", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_subscribe_query_delete_once`;
    const col = testCollection(firestore, tid);
    const batchId = `batch-${tid}`;
    await writeBatch(firestore)
      .set(doc(col, "doc1"), {
        text: "server",
        value: 1,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      })
      .commit();

    const result = await new Promise<{ changeCount: number; latest: TestDoc[] }>((resolve, reject) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => query(col));
        let armed = false;
        let changeCount = 0;
        let latest: TestDoc[] = [];

        createEffect(() => {
          const value = signal$();
          latest = value;
          if (!armed) return;
          changeCount++;
        });

        void (async () => {
          try {
            await waitUntil(() => latest.length === 1 && latest[0].text === "server");
            armed = true;

            service.overlay.apply(batchId, [
              {
                type: "delete",
                batchId: "",
                collection: col.id,
                id: "doc1",
                path: `${col.id}/doc1`,
              },
            ]);
            await waitUntil(() => latest.length === 0);

            await writeBatch(firestore).delete(doc(col, "doc1")).commit();
            service.overlay.markCommitted(batchId);
            await getDocs(service, query(col), { fromServer: true });
            await wait(300);

            resolve({ changeCount, latest });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            service.overlay.rollback(batchId, undefined);
            dispose();
          }
        })();
      });
    });

    test.expect(result.latest).toEqual([]);
    test.expect(result.changeCount).toBe(1);
  });

  it("createSubscribeSignal returns overlay set even when snapshot is missing", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_overlay_set`;
    const col = testCollection(firestore, tid);
    service.overlay.apply("batch-overlay-set", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { text: "optimistic", value: 7 },
      },
    ]);

    const result = await new Promise<TestDoc | undefined>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeSignal<TestDoc>(service, () => doc(col, "doc1"));
        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 200);
      });
    });

    test.expect(result?.text).toBe("optimistic");
    test.expect(result?.value).toBe(7);

    // Cleanup overlay so it doesn't pollute other tests
    service.overlay.rollback("batch-overlay-set", undefined);
  });

  it("createSubscribeSignal merges pending update into an existing snapshot", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_overlay_doc_update`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "doc1"), {
      text: "server",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-overlay-doc-update", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { text: "optimistic", value: 2 },
      },
    ]);

    const result = await new Promise<TestDoc | undefined>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeSignal<TestDoc>(service, () => doc(col, "doc1"));
        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 200);
      });
    });

    test.expect(result?.text).toBe("optimistic");
    test.expect(result?.value).toBe(2);

    service.overlay.rollback("batch-overlay-doc-update", undefined);
  });

  it("createSubscribeSignal hides a document with pending delete", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_overlay_doc_delete`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "doc1"), {
      text: "server",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-overlay-doc-delete", [
      {
        type: "delete",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
      },
    ]);

    const result = await new Promise<TestDoc | undefined>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeSignal<TestDoc>(service, () => doc(col, "doc1"));
        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 200);
      });
    });

    test.expect(result).toBeUndefined();

    service.overlay.rollback("batch-overlay-doc-delete", undefined);
  });

  it("createSubscribeAllSignal merges pending set into query results", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_overlay_query_set`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "server"), {
      text: "from-server",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-overlay-query", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "from-overlay", value: 2 },
      },
    ]);

    const result = await new Promise<TestDoc[]>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => query(col));
        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 200);
      });
    });

    const texts = result.map((r) => r.text).sort();
    test.expect(texts).toEqual(["from-overlay", "from-server"]);

    service.overlay.rollback("batch-overlay-query", undefined);
  });

  it("createSubscribeAllSignal merges pending update and delete into query results", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_overlay_query_update_delete`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "keep"), {
      text: "keep",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    setupBatch.set(doc(col, "move-out"), {
      text: "move-out",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    setupBatch.set(doc(col, "delete"), {
      text: "delete",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-overlay-query-update-delete", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "move-out",
        path: `${col.id}/move-out`,
        data: { value: 2 },
      },
      {
        type: "delete",
        batchId: "",
        collection: col.id,
        id: "delete",
        path: `${col.id}/delete`,
      },
    ]);

    const result = await new Promise<TestDoc[]>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => query(col, where("value", "==", 1)));
        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 200);
      });
    });

    test.expect(result.map((r) => (r as TestDoc & { id: string }).id)).toEqual(["keep"]);

    service.overlay.rollback("batch-overlay-query-update-delete", undefined);
  });
});

describe("getDoc/getDocs overlay boundary", () => {
  it("getDoc fromServer returns unmerged server data while default read includes overlay", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_get_doc_overlay`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "doc1"), {
      text: "server",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-get-doc-boundary", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { text: "optimistic", value: 2 },
      },
    ]);

    const fromServer = await getDoc(service, col, "doc1", { fromServer: true });
    const merged = await getDoc(service, col, "doc1");

    test.expect(fromServer?.text).toBe("server");
    test.expect(fromServer?.value).toBe(1);
    test.expect(merged?.text).toBe("optimistic");
    test.expect(merged?.value).toBe(2);

    service.overlay.rollback("batch-get-doc-boundary", undefined);
  });

  it("getDocs fromServer returns server snapshot while default read includes pending set", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_get_docs_overlay`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "server"), {
      text: "server",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-get-docs-boundary", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1 },
      },
    ]);

    const fromServer = await getDocs(service, query(col), { fromServer: true });
    const merged = await getDocs(service, query(col));

    test.expect(fromServer.map((d) => d.id)).toEqual(["server"]);
    test.expect(merged.map((d) => d.id).sort()).toEqual(["pending", "server"]);

    service.overlay.rollback("batch-get-docs-boundary", undefined);
  });

  it("getDocs recalculates a limited optimistic query from over-fetched backfill", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_get_docs_limit_backfill`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "first"), {
      text: "first",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    setupBatch.set(doc(col, "second"), {
      text: "second",
      value: 2,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    setupBatch.set(doc(col, "third"), {
      text: "third",
      value: 3,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-get-docs-limit-backfill", [
      {
        type: "delete",
        batchId: "",
        collection: col.id,
        id: "first",
        path: `${col.id}/first`,
      },
    ]);

    const result = await getDocs(service, query(col, orderBy("value"), limit(1)));

    test.expect(result.map((d) => d.id)).toEqual(["second"]);

    service.overlay.rollback("batch-get-docs-limit-backfill", undefined);
  });

  it("getDocs recalculates a limited optimistic query when an update crosses the limit boundary", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_get_docs_limit_update_backfill`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "first"), {
      text: "first",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    setupBatch.set(doc(col, "second"), {
      text: "second",
      value: 2,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    setupBatch.set(doc(col, "third"), {
      text: "third",
      value: 3,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-get-docs-limit-update-backfill", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "first",
        path: `${col.id}/first`,
        data: { value: 99 },
      },
    ]);

    const result = await getDocs(service, query(col, orderBy("value"), limit(1)));

    test.expect(result.map((d) => d.id)).toEqual(["second"]);

    service.overlay.rollback("batch-get-docs-limit-update-backfill", undefined);
  });

  it("getDocs fromServer trims an over-fetched wrapper limit back to the requested count", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_get_docs_from_server_limit_trim`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "first"), {
      text: "first",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    setupBatch.set(doc(col, "second"), {
      text: "second",
      value: 2,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    setupBatch.set(doc(col, "third"), {
      text: "third",
      value: 3,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    const result = await getDocs(service, query(col, orderBy("value"), limit(1)), { fromServer: true });

    test.expect(result.map((d) => d.id)).toEqual(["first"]);
  });

  it("getDocs with a raw Firestore query does not apply overlay", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_raw_query_overlay`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "server"), {
      text: "server",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-raw-query-boundary", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1 },
      },
    ]);

    const rawResult = await getDocs(service, firestoreQuery(col));
    const wrappedResult = await getDocs(service, query(col));

    test.expect(rawResult.map((d) => d.id)).toEqual(["server"]);
    test.expect(wrappedResult.map((d) => d.id).sort()).toEqual(["pending", "server"]);

    service.overlay.rollback("batch-raw-query-boundary", undefined);
  });

  it("getDocs with mixed raw constraints does not apply overlay", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_mixed_raw_constraint`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "server"), {
      text: "server",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-mixed-raw-boundary", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1 },
      },
    ]);

    const mixedRawResult = await getDocs(service, query(col, firestoreWhere("value", "==", 1)));
    const wrappedResult = await getDocs(service, query(col, where("value", "==", 1)));

    test.expect(mixedRawResult.map((d) => d.id)).toEqual(["server"]);
    test.expect(wrappedResult.map((d) => d.id).sort()).toEqual(["pending", "server"]);

    service.overlay.rollback("batch-mixed-raw-boundary", undefined);
  });

  it("getDocs with unsupported wrapper in filter fails closed without overlay", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_unsupported_in_filter`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "server"), {
      text: "server",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-unsupported-in-boundary", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1 },
      },
    ]);

    const result = await getDocs(service, query(col, where("text", "in", ["server", "pending"])));

    test.expect(result.map((d) => d.id)).toEqual(["server"]);

    service.overlay.rollback("batch-unsupported-in-boundary", undefined);
  });

  it("getDocs with unsupported array-contains filter fails closed without overlay", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_unsupported_array_contains`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "server"), {
      text: "server",
      value: 1,
      tags: ["match"],
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-unsupported-array-boundary", [
      {
        type: "set",
        batchId: "",
        collection: col.id,
        id: "pending",
        path: `${col.id}/pending`,
        data: { text: "pending", value: 1, tags: ["match"] },
      },
    ]);

    const result = await getDocs(service, query(col, where("tags", "array-contains", "match")));

    test.expect(result.map((d) => d.id)).toEqual(["server"]);

    service.overlay.rollback("batch-unsupported-array-boundary", undefined);
  });

  it("fromServer read can clear a committed overlay before the default read", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_from_server_catchup`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "doc1"), {
      text: "server",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-from-server-catchup", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { text: "server", value: 1 },
      },
    ]);
    service.overlay.markCommitted("batch-from-server-catchup");

    const fromServer = await getDoc(service, col, "doc1", { fromServer: true });
    const merged = await getDoc(service, col, "doc1");

    test.expect(fromServer?.text).toBe("server");
    test.expect(merged?.text).toBe("server");
  });

  it("getDocs fromServer empty snapshot clears committed overlay for a filtered query", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_from_server_empty_catchup`;
    const col = testCollection(firestore, tid);

    service.overlay.acknowledgeDocument(`${col.id}/doc1`, { text: "server", value: 1 });
    service.overlay.apply("batch-from-server-empty-catchup", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { value: 2 },
      },
    ]);
    service.overlay.markCommitted("batch-from-server-empty-catchup");

    const fromServer = await getDocs(service, query(col, where("value", "==", 1)), { fromServer: true });
    const merged = await getDocs(service, query(col, where("value", "==", 1)));

    test.expect(fromServer).toEqual([]);
    test.expect(merged).toEqual([]);
  });
});

describe("snapshot acknowledgement metadata", () => {
  it("acknowledges only server snapshots with no pending writes", (test) => {
    test.expect(shouldAcknowledgeSnapshotMetadata({ fromCache: false, hasPendingWrites: false })).toBe(true);
    test.expect(shouldAcknowledgeSnapshotMetadata({ fromCache: true, hasPendingWrites: false })).toBe(false);
    test.expect(shouldAcknowledgeSnapshotMetadata({ fromCache: false, hasPendingWrites: true })).toBe(false);
    test.expect(shouldAcknowledgeSnapshotMetadata({ fromCache: true, hasPendingWrites: true })).toBe(false);
  });
});

describe("createSubscribeAllSignal", () => {
  it("should return empty array when query$ returns undefined", async (test) => {
    const result = await new Promise<TestDoc[]>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => undefined);

        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 50);
      });
    });

    test.expect(result).toEqual([]);
  });

  it("should return results when query$ returns valid query", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = testCollection(firestore, tid);

    // Setup test data
    const batch = writeBatch(firestore);
    batch.set(doc(col, "doc1"), {
      text: "hello",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    batch.set(doc(col, "doc2"), {
      text: "world",
      value: 2,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await batch.commit();

    const result = await new Promise<TestDoc[]>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => query(col));

        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 100);
      });
    });

    test.expect(result.length).toBe(2);
    test.expect(result.map((r) => r.text).sort()).toEqual(["hello", "world"]);
  });

  it("should return empty array when query$ changes from valid query to undefined", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = testCollection(firestore, tid);

    // Setup test data
    const batch = writeBatch(firestore);
    batch.set(doc(col, "doc1"), {
      text: "test",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await batch.commit();

    const result = await new Promise<{ withQuery: TestDoc[]; withoutQuery: TestDoc[] }>((resolve) => {
      createRoot((dispose) => {
        const [queryEnabled$, setQueryEnabled] = createSignal(true);

        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => {
          if (queryEnabled$()) {
            return query(col);
          }
          return undefined;
        });

        setTimeout(() => {
          const withQuery = signal$();

          // Change query$ to return undefined
          setQueryEnabled(false);

          setTimeout(() => {
            const withoutQuery = signal$();
            resolve({ withQuery, withoutQuery });
            dispose();
          }, 100);
        }, 100);
      });
    });

    test.expect(result.withQuery.length).toBe(1);
    test.expect(result.withQuery[0]?.text).toBe("test");
    test.expect(result.withoutQuery).toEqual([]);
  });

  it("ready$ resets across undefined -> valid -> undefined -> valid query transitions", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_ready_transitions`;
    const col = testCollection(firestore, tid);
    const batch = writeBatch(firestore);
    batch.set(doc(col, "doc1"), {
      text: "one",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await batch.commit();

    const result = await new Promise<{
      initial: boolean;
      firstReady: boolean;
      afterUndefined: boolean;
      secondReady: boolean;
      secondResult: string[];
    }>((resolve, reject) => {
      createRoot((dispose) => {
        const [enabled$, setEnabled] = createSignal(false);
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => (enabled$() ? query(col) : undefined));

        void (async () => {
          try {
            const initial = signal$.ready$();
            setEnabled(true);
            await waitUntil(() => signal$.ready$() && signal$().length === 1);
            const firstReady = signal$.ready$();
            setEnabled(false);
            await waitUntil(() => !signal$.ready$() && signal$().length === 0);
            const afterUndefined = signal$.ready$();
            setEnabled(true);
            await waitUntil(() => signal$.ready$() && signal$().length === 1);
            resolve({
              initial,
              firstReady,
              afterUndefined,
              secondReady: signal$.ready$(),
              secondResult: signal$().map((doc) => doc.text),
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            dispose();
          }
        })();
      });
    });

    test.expect(result).toEqual({
      initial: false,
      firstReady: true,
      afterUndefined: false,
      secondReady: true,
      secondResult: ["one"],
    });
  });

  it("switches directly between valid queries without leaking the previous snapshot", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_query_switch`;
    const col = testCollection(firestore, tid);
    const batch = writeBatch(firestore);
    batch.set(doc(col, "doc1"), {
      text: "one",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    batch.set(doc(col, "doc2"), {
      text: "two",
      value: 2,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await batch.commit();

    const result = await new Promise<{ first: string[]; second: string[] }>((resolve) => {
      createRoot((dispose) => {
        const [selectedValue$, setSelectedValue] = createSignal(1);
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () =>
          query(col, where("value", "==", selectedValue$())),
        );

        setTimeout(() => {
          const first = signal$().map((d) => d.text);
          setSelectedValue(2);

          setTimeout(() => {
            const second = signal$().map((d) => d.text);
            resolve({ first, second });
            dispose();
          }, 200);
        }, 200);
      });
    });

    test.expect(result.first).toEqual(["one"]);
    test.expect(result.second).toEqual(["two"]);
  });

  it("clears committed overlay when a filtered subscription receives an empty server result", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_filtered_empty_subscription_catchup`;
    const col = testCollection(firestore, tid);

    service.overlay.acknowledgeDocument(`${col.id}/doc1`, { text: "server", value: 1 });
    service.overlay.apply("batch-filtered-empty-subscription-catchup", [
      {
        type: "update",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
        data: { value: 2 },
      },
    ]);
    service.overlay.markCommitted("batch-filtered-empty-subscription-catchup");

    const result = await new Promise<{ first: TestDoc[]; after: TestDoc | undefined }>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => query(col, where("value", "==", 1)));
        setTimeout(() => {
          const first = signal$();
          const after = service.overlay.mergeDocument<TestDoc>(col.id, "doc1", {
            id: "doc1",
            text: "new-server",
            value: 3,
            createdAt: timestampForCreatedAt,
            updatedAt: timestampForCreatedAt,
          });
          resolve({ first, after });
          dispose();
        }, 250);
      });
    });

    test.expect(result.first).toEqual([]);
    test.expect(result.after?.text).toBe("new-server");
  });

  it("does not hide a same-id server recreation after a committed filtered delete", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_filtered_delete_recreate`;
    const col = testCollection(firestore, tid);
    const setupBatch = writeBatch(firestore);
    setupBatch.set(doc(col, "doc1"), {
      text: "recreated",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await setupBatch.commit();

    service.overlay.apply("batch-filtered-delete-recreate", [
      {
        type: "delete",
        batchId: "",
        collection: col.id,
        id: "doc1",
        path: `${col.id}/doc1`,
      },
    ]);
    service.overlay.markCommitted("batch-filtered-delete-recreate");

    const result = await new Promise<TestDoc[]>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeAllSignal<TestDoc>(service, () => query(col, where("value", "==", 1)));
        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 250);
      });
    });

    test.expect(result.map((doc) => doc.text)).toEqual(["recreated"]);
  });
});

describe("waitForServerSync", () => {
  it("waits for the requested batchVersion and ignores other versions", async (test) => {
    const batchVersionCol = collection(
      firestore,
      "batchVersion",
    ) as SchemaCollectionReference<"batchVersion">;
    const firstVersion = `${test.task.id}-first-${Date.now()}`;
    const expectedVersion = `${test.task.id}-expected-${Date.now()}`;

    const wait = waitForServerSync(service, expectedVersion).then(() => "resolved" as const);
    await writeBatch(firestore)
      .set(doc(batchVersionCol, singletonDocumentId), {
        prevVersion: "",
        version: firstVersion,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      })
      .commit();

    const early = await Promise.race([
      wait,
      new Promise<"pending">((resolve) => {
        setTimeout(() => {
          resolve("pending");
        }, 100);
      }),
    ]);
    test.expect(early).toBe("pending");

    await writeBatch(firestore)
      .set(doc(batchVersionCol, singletonDocumentId), {
        prevVersion: firstVersion,
        version: expectedVersion,
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      })
      .commit();

    await test.expect(wait).resolves.toBe("resolved");
  });
});

describe("createSubscribeSignal", () => {
  it("should return undefined when query$ returns undefined", async (test) => {
    const result = await new Promise<TestDoc | undefined>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeSignal<TestDoc>(service, () => undefined);

        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 50);
      });
    });

    test.expect(result).toBeUndefined();
  });

  it("should return document when query$ returns valid document reference", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = testCollection(firestore, tid);

    // Setup test data
    const batch = writeBatch(firestore);
    batch.set(doc(col, "doc1"), {
      text: "single doc",
      value: 42,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await batch.commit();

    const result = await new Promise<TestDoc | undefined>((resolve) => {
      createRoot((dispose) => {
        const signal$ = createSubscribeSignal<TestDoc>(service, () => doc(col, "doc1"));

        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 100);
      });
    });

    test.expect(result?.text).toBe("single doc");
    test.expect(result?.value).toBe(42);
  });

  it("should return undefined when query$ changes from valid reference to undefined", async (test) => {
    const now = new Date();
    const tid = `${test.task.id}_${now.getTime()}`;
    const col = testCollection(firestore, tid);

    // Setup test data
    const batch = writeBatch(firestore);
    batch.set(doc(col, "doc1"), {
      text: "test doc",
      value: 99,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await batch.commit();

    const result = await new Promise<{ withQuery: TestDoc | undefined; withoutQuery: TestDoc | undefined }>(
      (resolve) => {
        createRoot((dispose) => {
          const [queryEnabled$, setQueryEnabled] = createSignal(true);

          const signal$ = createSubscribeSignal<TestDoc>(service, () => {
            if (queryEnabled$()) {
              return doc(col, "doc1");
            }
            return undefined;
          });

          setTimeout(() => {
            const withQuery = signal$();

            // Change query$ to return undefined
            setQueryEnabled(false);

            setTimeout(() => {
              const withoutQuery = signal$();
              resolve({ withQuery, withoutQuery });
              dispose();
            }, 100);
          }, 100);
        });
      },
    );

    test.expect(result.withQuery?.text).toBe("test doc");
    test.expect(result.withoutQuery).toBeUndefined();
  });

  it("switches directly between valid document refs without leaking the previous snapshot", async (test) => {
    const tid = `${test.task.id}_${Date.now()}_doc_switch`;
    const col = testCollection(firestore, tid);
    const batch = writeBatch(firestore);
    batch.set(doc(col, "doc1"), {
      text: "one",
      value: 1,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    batch.set(doc(col, "doc2"), {
      text: "two",
      value: 2,
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    });
    await batch.commit();

    const result = await new Promise<{ first: string | undefined; second: string | undefined }>((resolve) => {
      createRoot((dispose) => {
        const [selectedId$, setSelectedId] = createSignal("doc1");
        const signal$ = createSubscribeSignal<TestDoc>(service, () => doc(col, selectedId$()));

        setTimeout(() => {
          const first = signal$()?.text;
          setSelectedId("doc2");

          setTimeout(() => {
            const second = signal$()?.text;
            resolve({ first, second });
            dispose();
          }, 200);
        }, 200);
      });
    });

    test.expect(result.first).toBe("one");
    test.expect(result.second).toBe("two");
  });
});
