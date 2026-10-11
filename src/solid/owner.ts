import { createRoot, getOwner, runWithOwner } from "solid-js";

// Wrap a callback to run with the current SolidJS owner
// This allows hooks like useActions() to work inside async callbacks
export function withOwner<Args extends unknown[], R>(callback: (...args: Args) => R): (...args: Args) => R | undefined {
  const owner = getOwner();
  return (...args: Args) => {
    // Not run directly under the owner: it lives as long as its component, so every computation a call
    // creates (e.g. the memo behind a JSX prop like `isSelected={a() && b()}` read in a keydown handler)
    // would pile up under it and re-run on each change of what it reads, slowing the page the longer it
    // stays open. A root disposed on return keeps the owner's context and frees them.
    return runWithOwner(owner, () =>
      createRoot((dispose) => {
        try {
          return callback(...args);
        } finally {
          dispose();
        }
      }),
    );
  };
}
