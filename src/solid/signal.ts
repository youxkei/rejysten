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
  return createMemo<T>((prev) => {
    const clock = clock$();
    const data = signal$();
    return clock ? prev : data;
  }, initialValue);
}
