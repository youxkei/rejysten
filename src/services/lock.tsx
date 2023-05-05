import type { JSXElement } from "solid-js";

import userEvent from "@testing-library/user-event";
import { createContext, createMemo, createSignal, startTransition, untrack, useContext } from "solid-js";

import { renderAsync } from "@/test";

export type LockService = {
  lock$: () => boolean;
  setLock: (lock: boolean) => void;
};

const context = createContext<LockService>();

export function LockServiceProvider(props: { children: JSXElement }) {
  const [lock$, setLock] = createSignal(false);

  return <context.Provider value={{ lock$, setLock }}>{props.children}</context.Provider>;
}

export function useLockService() {
  const service = useContext(context);
  if (!service) throw new Error();

  return service;
}

export async function runWithLock(service: LockService, runner: () => Promise<unknown>) {
  if (untrack(service.lock$)) return;

  service.setLock(true);

  try {
    await runner();
  } finally {
    startTransition(() => service.setLock(false));
  }
}

export function createSignalWithLock<T>(service: LockService, value$: () => T, initialValue: T) {
  const memo$ = createMemo<{ value: T; lock: boolean }>(
    (prev) => {
      const lock = service.lock$();
      if (lock) return { value: prev.value, lock: true };

      return { value: value$(), lock: false };
    },
    { value: initialValue, lock: false },
    { equals: (_, next) => next.lock }
  );

  return () => memo$().value;
}

if (import.meta.vitest) {
  describe("createSignalWithLock and runWithLock", () => {
    test("updated separately without lock", async (test) => {
      const user = userEvent.setup();
      const { container, unmount, findByText } = await renderAsync(
        (props) => (
          <LockServiceProvider>
            {(() => {
              const [x$, setX] = createSignal("x");
              const [y$, setY] = createSignal("y");

              async function onClick() {
                setX("updated x");
                await new Promise((resolve) => queueMicrotask(() => resolve(0)));
                setY("updated y");
              }

              return (
                <>
                  <p>{x$()}</p>
                  <p>{y$()}</p>
                  <button onClick={onClick}>update</button>
                </>
              );
            })()}
            {props.children}
          </LockServiceProvider>
        ),
        (resolve: (value: object) => void) => {
          resolve({});
        }
      );

      test.expect(container).toMatchSnapshot("initial");

      user.click(container.querySelector("button")!);

      await findByText("updated x");
      test.expect(container).toMatchSnapshot("updated x");

      await findByText("updated y");
      test.expect(container).toMatchSnapshot("updated y");

      unmount();
    });

    test("updated separately with createSignalWithLock without runWithLock", async (test) => {
      const user = userEvent.setup();
      const { container, unmount, findByText } = await renderAsync(
        (props) => (
          <LockServiceProvider>
            {(() => {
              const service = useLockService();

              const [x$, setX] = createSignal("x");
              const [y$, setY] = createSignal("y");

              const xWithLock$ = createSignalWithLock(service, x$, "x");
              const yWithLock$ = createSignalWithLock(service, y$, "y");

              async function onClick() {
                setX("updated x");
                await new Promise((resolve) => queueMicrotask(() => resolve(0)));
                setY("updated y");
              }

              return (
                <>
                  <p>{xWithLock$()}</p>
                  <p>{yWithLock$()}</p>
                  <button onClick={onClick}>update</button>
                </>
              );
            })()}
            {props.children}
          </LockServiceProvider>
        ),
        (resolve: (value: object) => void) => {
          resolve({});
        }
      );

      test.expect(container).toMatchSnapshot("initial");

      user.click(container.querySelector("button")!);

      await findByText("updated x");
      test.expect(container).toMatchSnapshot("updated x");

      await findByText("updated y");
      test.expect(container).toMatchSnapshot("updated y");

      unmount();
    });

    test("updated simultaneously with createSignalWithLock and runWithLock", async (test) => {
      const user = userEvent.setup();
      const { container, unmount, findByText } = await renderAsync(
        (props) => (
          <LockServiceProvider>
            {(() => {
              const service = useLockService();

              const [x$, setX] = createSignal("x");
              const [y$, setY] = createSignal("y");

              const xWithLock$ = createSignalWithLock(service, x$, "x");
              const yWithLock$ = createSignalWithLock(service, y$, "y");

              async function onClick() {
                await runWithLock(service, async () => {
                  setX("updated x");
                  await new Promise((resolve) => queueMicrotask(() => resolve(0)));
                  setY("updated y");
                });
              }

              return (
                <>
                  <p>{xWithLock$()}</p>
                  <p>{yWithLock$()}</p>
                  <button onClick={onClick}>update</button>
                </>
              );
            })()}
            {props.children}
          </LockServiceProvider>
        ),
        (resolve: (value: object) => void) => {
          resolve({});
        }
      );

      test.expect(container).toMatchSnapshot("initial");

      user.click(container.querySelector("button")!);

      await findByText("updated x");
      test.expect(container).toMatchSnapshot("updated x");

      unmount();
    });
  });
}
