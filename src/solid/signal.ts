import { type Accessor, createComputed, createMemo } from "solid-js";

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
