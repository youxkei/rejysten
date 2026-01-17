import { getOwner, onCleanup, runWithOwner } from "solid-js";

export function addKeyDownEventListener(callback: (event: KeyboardEvent) => void) {
  const owner = getOwner();

  const listener = (event: KeyboardEvent) => {
    runWithOwner(owner, () => {
      callback(event);
    });
  };

  window.addEventListener("keydown", listener);

  onCleanup(() => {
    window.removeEventListener("keydown", listener);
  });
}

// Create an onClick handler that preserves SolidJS context (owner)
// This allows hooks like useActionsContext() to work inside onClick callbacks
export function createOnClickHandler<T extends (...args: unknown[]) => unknown>(callback: T): T {
  const owner = getOwner();
  return ((...args: unknown[]) => {
    return runWithOwner(owner, () => callback(...args));
  }) as T;
}
