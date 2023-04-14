import { createCollections } from "@/rxdb/test";

import { RxDocument } from "rxdb";

import { Lock } from "@/domain/lock";
import { ActionContext, createActionContext } from "@/actions/context";

async function acquireLock(ctx: ActionContext) {
  let lock = await ctx.collections.locks.findOne("lock").exec();

  if (lock === null) {
    try {
      lock = await ctx.collections.locks.insert({
        id: "lock",
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

export function createDoWithLockSignal(ctx$: () => ActionContext | undefined) {
  return () => {
    const ctx = ctx$();
    if (!ctx) return;

    return async (action: (ctx: ActionContext) => Promise<unknown>) => {
      const lock = await acquireLock(ctx);
      if (!lock) return;

      try {
        await action(ctx);
      } finally {
        await releaseLock(lock);
      }
    };
  };
}

if (import.meta.vitest) {
  describe("acquireLock and releaseLock", () => {
    test("cannot aquice the lock only when the lock is already acquired", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let ctx = createActionContext(collections, Date.now());

      const lock = await acquireLock(ctx);
      test.expect(lock).not.toBeNull();

      test.expect(await acquireLock(ctx)).toBeUndefined();

      await releaseLock(lock!);

      test.expect(await acquireLock(ctx)).not.toBeNull();
    });
  });

  describe("createDoWithLockSignal", () => {
    test("only one function is executed with lock", async (test) => {
      const tid = test.meta.id;
      let now = Date.now();
      let collections = await createCollections(tid);
      let ctx$ = () => createActionContext(collections, now);
      const doWithLock = createDoWithLockSignal(ctx$)()!;

      await Promise.all([
        doWithLock(async (ctx) => {
          await ctx.collections.actionLogs.insert({
            id: "1",
            text: "foo",
            beginAt: 0,
            endAt: 0,
            updatedAt: ctx.now,
          });
        }),
        doWithLock(async (ctx) => {
          await ctx.collections.actionLogs.insert({
            id: "2",
            text: "bar",
            beginAt: 0,
            endAt: 0,
            updatedAt: ctx.now,
          });
        }),
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
