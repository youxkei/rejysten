import { type Accessor, createComputed, createSignal } from "solid-js";

export function mapSignal<T, U>(signal$: Accessor<T>, callback: (element: T) => U) {
  return () => callback(signal$());
}

export function dumpSignal<T>(signal$: Accessor<T>) {
  createComputed(() => {
    console.log("dump: ", signal$());
  });

  return signal$;
}

export function createLatchSignal<T>(
  signal$: Accessor<T>,
  clock$: Accessor<boolean>,
  initialValue: T,
): Accessor<T> {
  // Push-based latch: createComputed eagerly tracks clock$ and signal$, and
  // mirrors signal$ into latched$ whenever clock is false. Using createComputed
  // (not createMemo) guarantees the latched value is refreshed as soon as signal$
  // changes during a clock=false window, even if nothing reads the latch in that
  // window. A lazy createMemo would keep its stale `prev` until read, and the
  // next read during clock=true would return that stale prev — a race that made
  // editHistoryHead$ sometimes appear empty right after an action completed.
  const [latched$, setLatched] = createSignal<T>(initialValue);
  createComputed(() => {
    const clock = clock$();
    const data = signal$();
    if (!clock) {
      setLatched(() => data);
    }
  });
  return latched$;
}
