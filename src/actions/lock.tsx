import { createSignal } from "solid-js";
import {
  render,
  queryByText,
  waitForElementToBeRemoved,
  findByText,
} from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createCollections, TestWithRxDB } from "@/rxdb/test";

import { RxDocument } from "rxdb";

import { Lock } from "@/domain/lock";
import { ActionContext, createActionContext, createActionContextSignal } from "@/actions/context";

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
    lock = await lock.update({
      $set: {
        isLocked: true,
      },
    });
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
      let ctx = createActionContext(collections);

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
      let collections = await createCollections(tid);

      const { container, unmount } = render(() => (
        <TestWithRxDB tid={tid}>
          {(() => {
            const doWithLock$ = createDoWithLockSignal(createActionContextSignal());
            const [text$, setText] = createSignal("");
            const onClick$ = () => {
              const doWithLock = doWithLock$();
              if (!doWithLock) return;

              return async () => {
                await Promise.all([
                  doWithLock(async (ctx) => {
                    await ctx.collections.actionLogs.insert({
                      id: "01",
                      text: "foo",
                      beginAt: 0,
                      endAt: 0,
                      updatedAt: 0,
                    });
                  }),
                  doWithLock(async (ctx) => {
                    await ctx.collections.actionLogs.insert({
                      id: "02",
                      text: "bar",
                      beginAt: 0,
                      endAt: 0,
                      updatedAt: 0,
                    });
                  }),
                ]);

                setText("clicked");
              };
            };

            return <button onClick={onClick$()}>{text$()}</button>;
          })()}
        </TestWithRxDB>
      ));

      await waitForElementToBeRemoved(() => queryByText(container, tid));

      userEvent.setup().click(container.querySelector("button")!);
      await findByText(container, "clicked");

      const actionLogs = await collections.actionLogs.find().exec();
      test.expect(actionLogs.length).toBe(1);
      test.expect(["01", "02"]).toContain(actionLogs[0].id);

      unmount();
    });
  });
}
