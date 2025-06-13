import { type Accessor, createComputed, createMemo, createSignal, onCleanup } from "solid-js";

export function mapSignal<T, U>(signal$: Accessor<T>, callback: (element: T) => U) {
  return () => callback(signal$());
}

export function dumpSignal<T>(signal$: Accessor<T>) {
  createComputed(() => {
    console.log("dump: ", signal$());
  });

  return signal$;
}

export function createLatchSignal<T>(signal$: Accessor<T>, clock$: Accessor<boolean>, initialValue: T) {
  const memoized = createMemo(
    (prev: { clock: boolean; changedDuringClockHigh: boolean; data: T }) => {
      const clock = clock$();
      const data = signal$();

      return { clock, changedDuringClockHigh: clock && prev.clock, data };
    },
    { clock: false, changedDuringClockHigh: false, data: initialValue },
    {
      equals: (prev, next) => {
        if (next.clock) {
          return true;
        }

        return prev.clock && !prev.changedDuringClockHigh;
      },
    },
  );

  return () => memoized().data;
}

export function createTickSignal(unitMs: number): Accessor<number> {
  const [now$, setNow] = createSignal(Date.now());

  let timeoutId: number | undefined;

  function setTimer(): number {
    return window.setTimeout(
      () => {
        setNow(Date.now());

        timeoutId = setTimer();
      },
      unitMs - (Date.now() % unitMs),
    );
  }

  timeoutId = setTimer();

  onCleanup(() => {
    clearTimeout(timeoutId);
  });

  return now$;
}
