import { type CollectionReference, type Firestore, collection, writeBatch, doc, query } from "firebase/firestore";
import { createRoot, createSignal } from "solid-js";
import { describe, it, beforeAll, afterAll } from "vitest";

import { type Timestamps, type FirestoreService } from "@/services/firebase/firestore";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { createTestFirestoreService, timestampForCreatedAt } from "@/services/firebase/firestore/test";
import { acquireEmulator, releaseEmulator, getEmulatorPort } from "@/test";

type TestDoc = Timestamps & { text: string; value: number };

let service: FirestoreService;
let firestore: Firestore;

beforeAll(async () => {
  await acquireEmulator();
  const emulatorPort = await getEmulatorPort();
  const result = createTestFirestoreService(emulatorPort, "subscribe-test");
  const [clock$] = createSignal(false);
  service = { ...result, clock$ } as FirestoreService;
  firestore = result.firestore;
});

afterAll(async () => {
  await releaseEmulator();
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
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

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
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

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
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

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
    const col = collection(firestore, tid) as CollectionReference<TestDoc>;

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
});
