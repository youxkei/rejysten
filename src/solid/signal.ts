import { createComputed } from "solid-js";

export function mapSignal<T, U>(signal$: () => T, callback: (element: T) => U) {
  return () => callback(signal$());
}

export function dumpSignal<T>(signal$: () => T) {
  createComputed(() => {
    console.log("dump: ", signal$());
  });

  return signal$;
}
