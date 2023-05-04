import type { CollectionNameToDocumentType, Collections } from ".";
import type { RxDBService } from "@/services/rxdb";
import type { RxDocument } from "rxdb";

import { createMemo } from "solid-js";

import { createSubscribeSignal } from "@/services/rxdb/subscribe";
import { createCollectionsForTest } from "@/services/rxdb/test";

export type Lock = CollectionNameToDocumentType["locks"];
export type LockDocument = RxDocument<Lock>;

function createLockSignal(service: RxDBService) {
  return createSubscribeSignal(() => service.collections$()?.locks.findOne("const"));
}

export function createSignalWithLock<T>(service: RxDBService, value$: () => T, initialValue: T) {
  const lock$ = createLockSignal(service);

  const valueWithLock$ = createMemo(
    () => {
      const lock = lock$();
      if (!lock || lock.isLocked) {
        return { preventUpdate: true, value: initialValue };
      }

      return { preventUpdate: false, value: value$() };
    },
    { preventUpdate: false, value: initialValue },
    { equals: (_, next) => next.preventUpdate }
  );

  return () => valueWithLock$().value;
}

async function acquireLock(collections: Collections) {
  let lock = await collections.locks.findOne("const").exec();

  if (lock === null) {
    try {
      lock = await collections.locks.insert({
        id: "const",
        isLocked: true,
      });

      return lock;
    } catch {
      return;
    }
  }

  if (lock.isLocked) {
    return;
  }

  try {
    lock = await lock.patch({ isLocked: true });
  } catch {
    return;
  }

  return lock;
}

async function releaseLock(lock: RxDocument<Lock>) {
  await lock.incrementalPatch({
    isLocked: false,
  });
}

if (import.meta.vitest) {
  describe("acquireLock and releaseLock", () => {
    test("cannot aquice the lock only when the lock is already acquired", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollectionsForTest(tid);

      const lock = await acquireLock(collections);
      test.expect(lock).not.toBeNull();

      test.expect(await acquireLock(collections)).toBeUndefined();

      await releaseLock(lock!);

      test.expect(await acquireLock(collections)).not.toBeNull();
    });
  });
}

export async function doWithLock(service: RxDBService, action: () => Promise<unknown>) {
  const collections = service.collections$();
  if (!collections) return;

  const lock = await acquireLock(collections);
  if (!lock) return;

  try {
    await action();
  } finally {
    await releaseLock(lock);
  }
}

if (import.meta.vitest) {
  describe("doWithLock", () => {
    test("only one function is executed with lock", async (test) => {
      const tid = test.meta.id;
      let now = Date.now();
      let collections = await createCollectionsForTest(tid);
      const service = { database$: () => undefined, collections$: () => collections };

      await Promise.all([
        doWithLock(service, () =>
          collections.actionLogs.insert({
            id: "1",
            text: "foo",
            beginAt: 0,
            endAt: 0,
            updatedAt: now,
          })
        ),
        doWithLock(service, () =>
          collections.actionLogs.insert({
            id: "2",
            text: "bar",
            beginAt: 0,
            endAt: 0,
            updatedAt: now,
          })
        ),
      ]);

      test.expect.assertions(2);
      const actionLogs = await collections.actionLogs.find().exec();
      test.expect(actionLogs.length).toBe(1);
      const actionLog = actionLogs[0].toJSON();

      switch (actionLog.id) {
        case "1":
          test.expect(actionLog).toEqual({
            id: "1",
            text: "foo",
            beginAt: 0,
            endAt: 0,
            updatedAt: now,
          });
          break;

        case "2":
          test.expect(actionLog).toEqual({
            id: "2",
            text: "bar",
            beginAt: 0,
            endAt: 0,
            updatedAt: now,
          });
          break;
      }
    });
  });
}
