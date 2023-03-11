import { RxDocument } from "rxdb";

import { Collections } from "@/rxdb/collections";
import { Lock } from "@/domain/lock";

export async function acquireLock(collections: Collections) {
  let lock = await collections.locks.findOne("lock").exec();

  if (lock === null) {
    try {
      lock = await collections.locks.insert({
        id: "lock",
        isLocked: true,
      });

      return lock;
    } catch {
      return null;
    }
  }

  if (lock.isLocked) {
    return null;
  }

  try {
    lock = await lock.update({
      $set: {
        isLocked: true,
      },
    });
  } catch {
    return null;
  }

  return lock;
}

export async function releaseLock(lock: RxDocument<Lock>) {
  await lock.incrementalPatch({
    isLocked: false,
  });
}

import { createCollections } from "@/rxdb/test";

if (import.meta.vitest) {
  test("cannot aquice the lock only when the lock is already acquired", async (ctx) => {
    const tid = ctx.meta.id;
    let collections = await createCollections(tid);

    const lock = await acquireLock(collections);
    ctx.expect(lock).not.toBeNull();

    ctx.expect(await acquireLock(collections)).toBeNull();

    await releaseLock(lock!);

    ctx.expect(await acquireLock(collections)).not.toBeNull();
  });
}
