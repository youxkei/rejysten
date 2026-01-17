import { getOwner, runWithOwner } from "solid-js";

// Wrap a callback to run with the current SolidJS owner
// This allows hooks like useActions() to work inside async callbacks
export function withOwner<Args extends unknown[], R>(callback: (...args: Args) => R): (...args: Args) => R | undefined {
  const owner = getOwner();
  return (...args: Args) => {
    return runWithOwner(owner, () => callback(...args));
  };
}
