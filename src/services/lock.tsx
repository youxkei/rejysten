import type { RxDBService } from "@/services/rxdb";
import type { JSXElement } from "solid-js";

import userEvent from "@testing-library/user-event";
import { createRenderEffect, createRoot, onMount, createEffect, createContext, createMemo, createSignal, startTransition, useContext } from "solid-js";

import { ServiceNotAvailable } from "@/services/error";
import { useRxDBService } from "@/services/rxdb";
import { createSubscribeSignal } from "@/services/rxdb/subscribe";
import { renderWithServicesForTest } from "@/services/test";
import { getPromiseWithResolve } from "@/test";

export type LockService = {
  lock$: () => boolean;
  setLock: (isLocked: boolean) => void;

  rxdb: RxDBService;
};

const context = createContext<LockService>();

export function LockServiceProvider(props: { children: JSXElement }) {
  const rxdb = useRxDBService();
  const [lock$, setLock] = createSignal(false);

  const unlockEvent$ = createSubscribeSignal(() => rxdb.collections.localEvents.findOne("unlock"));
  createEffect(async () => {
    const unlockEvent = unlockEvent$();
    if (!unlockEvent) return;

    await startTransition(() => setLock(false));
  });

  return <context.Provider value={{ setLock, lock$, rxdb }}>{props.children}</context.Provider>;
}

export function useLockService() {
  const service = useContext(context);
  if (!service) throw new ServiceNotAvailable("Lock");

  return service;
}

export function waitLockRelease({ lock$ }: LockService, unlockHook?: () => unknown) {
  return new Promise<void>((resolve) => {
    createRoot((dispose) => {
      createRenderEffect(() => {
        if (!lock$()) {
          if (unlockHook) {
            unlockHook();
          }

          dispose();
          resolve();
        }
      });
    });
  });
}

export async function runWithLock(lock: LockService, runner: () => Promise<unknown>) {
  const {
    setLock,
    rxdb: { collections },
  } = lock;

  // wait for the lock to be released, and then acquire lock
  await waitLockRelease(lock, () => setLock(true));

  try {
    await runner();
  } finally {
    await collections.localEvents.upsert({ id: "unlock" });
  }
}

if (import.meta.vitest) {
  describe("runWithLock", () => {
    test("concurrent counting doesn't work without runWithLock", async (test) => {
      const { promise, resolve } = getPromiseWithResolve();
      let count = 0;

      const { unmount } = await renderWithServicesForTest(test.meta.id, (props) => {
        onMount(async () => {
          const increment = async () => {
            const c = count;

            await new Promise<void>((resolve) => queueMicrotask(resolve));

            count = c + 1;
          };

          await Promise.all([increment(), increment(), increment()]);

          resolve();
        });

        return <>{props.children}</>;
      });

      await promise;

      test.expect(count).toBeLessThan(3);

      unmount();
    });

    test("concurrent counting works with runWithLock", async (test) => {
      const { promise, resolve } = getPromiseWithResolve();
      let count = 0;

      const { unmount } = await renderWithServicesForTest(test.meta.id, (props) => {
        const lock = useLockService();

        onMount(async () => {
          const increment = async () => {
            await runWithLock(lock, async () => {
              const c = count;

              await new Promise<void>((resolve) => queueMicrotask(resolve));

              count = c + 1;
            });
          };

          await Promise.all([increment(), increment(), increment()]);

          resolve();
        });

        return <>{props.children}</>;
      });

      await promise;

      test.expect(count).toBe(3);

      unmount();
    });
  });
}

export function createSignalWithLock<T>(service: LockService, value$: () => T, initialValue: T, compare?: boolean) {
  const memo$ = createMemo<{ value: T; lock: boolean }>(
    (prev) => {
      const lock = service.lock$();
      if (lock) return { value: prev.value, lock: true };

      return { value: value$(), lock: false };
    },
    { value: initialValue, lock: false },
    { equals: (prev, next) => next.lock || (!!compare && prev.value === next.value) }
  );

  return () => memo$().value;
}

if (import.meta.vitest) {
  describe("createSignalWithLock and runWithLock", () => {
    test("updated separately without lock", async (test) => {
      const user = userEvent.setup();
      const { container, unmount, findByText } = await renderWithServicesForTest(test.meta.id, (props) => {
        const [x$, setX] = createSignal("x");
        const [y$, setY] = createSignal("y");

        async function onClick() {
          setX("updated x");
          await new Promise<void>((resolve) => queueMicrotask(resolve));
          setY("updated y");
        }

        return (
          <>
            <p>{x$()}</p>
            <p>{y$()}</p>
            <button onClick={onClick}>update</button>
            {props.children}
          </>
        );
      });

      test.expect(container).toMatchSnapshot("initial");

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      user.click(container.querySelector("button")!);

      await findByText("updated x");
      test.expect(container).toMatchSnapshot("updated x");

      await findByText("updated y");
      test.expect(container).toMatchSnapshot("updated y");

      unmount();
    });

    test("updated separately with createSignalWithLock without runWithLock", async (test) => {
      const user = userEvent.setup();
      const { container, unmount, findByText } = await renderWithServicesForTest(test.meta.id, (props) => {
        const service = useLockService();

        const [x$, setX] = createSignal("x");
        const [y$, setY] = createSignal("y");

        const xWithLock$ = createSignalWithLock(service, x$, "x");
        const yWithLock$ = createSignalWithLock(service, y$, "y");

        async function onClick() {
          setX("updated x");
          await new Promise<void>((resolve) => queueMicrotask(resolve));
          setY("updated y");
        }

        return (
          <>
            <p>{xWithLock$()}</p>
            <p>{yWithLock$()}</p>
            <button onClick={onClick}>update</button>
            {props.children}
          </>
        );
      });

      test.expect(container).toMatchSnapshot("initial");

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      user.click(container.querySelector("button")!);

      await findByText("updated x");
      test.expect(container).toMatchSnapshot("updated x");

      await findByText("updated y");
      test.expect(container).toMatchSnapshot("updated y");

      unmount();
    });

    test("updated simultaneously with createSignalWithLock and runWithLock", async (test) => {
      const user = userEvent.setup();
      const { container, unmount, findByText } = await renderWithServicesForTest(test.meta.id, (props) => {
        const service = useLockService();

        const [x$, setX] = createSignal("x");
        const [y$, setY] = createSignal("y");

        const xWithLock$ = createSignalWithLock(service, x$, "x");
        const yWithLock$ = createSignalWithLock(service, y$, "y");

        async function onClick() {
          await runWithLock(service, async () => {
            setX("updated x");
            await new Promise<void>((resolve) => queueMicrotask(resolve));
            setY("updated y");
          });
        }

        return (
          <>
            <p>{xWithLock$()}</p>
            <p>{yWithLock$()}</p>
            <button onClick={onClick}>update</button>
            {props.children}
          </>
        );
      });

      test.expect(container).toMatchSnapshot("initial");

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      user.click(container.querySelector("button")!);

      await findByText("updated x");
      test.expect(container).toMatchSnapshot("updated x");

      unmount();
    });
  });
}
