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
