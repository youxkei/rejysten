import { getOwner, onCleanup, runWithOwner } from "solid-js";

export function addKeyDownEventListener(callback: (event: KeyboardEvent) => Promise<void>) {
  const owner = getOwner();

  const listener = (event: KeyboardEvent) => {
    runWithOwner(
      owner,
      () =>
        void callback(event).catch((e: unknown) => {
          console.error("Error in keydown event listener:", e);
        }),
    );
  };

  window.addEventListener("keydown", listener);

  onCleanup(() => {
    window.removeEventListener("keydown", listener);
  });
}
