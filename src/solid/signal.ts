export function mapSignal<T, U>(signal$: () => T, callback: (element: T) => U) {
  return () => callback(signal$());
}
