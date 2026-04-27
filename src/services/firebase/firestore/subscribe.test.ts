import {
  type Firestore,
  type Timestamp,
  collection,
  writeBatch,
  doc,
} from "firebase/firestore";
import { createRoot, createSignal } from "solid-js";
import { describe, it, beforeAll, afterAll } from "vitest";

import {
  type Timestamps,
  type FirestoreService,
  type SchemaCollectionReference,
  waitForServerSync,
  singletonDocumentId,
} from "@/services/firebase/firestore";
import { query, where } from "@/services/firebase/firestore/query";
import {
  createSubscribeAllSignal,
  createSubscribeSignal,
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
  service = {
    ...result,
    clock$,
    setClock: () => undefined,
    batchVersion$: () => undefined,
    services: {
      firebase: {} as FirestoreService["services"]["firebase"],
      store: {} as FirestoreService["services"]["store"],
    },
  } as FirestoreService;
  firestore = result.firestore;
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
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
