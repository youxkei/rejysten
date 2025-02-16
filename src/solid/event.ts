import { onCleanup } from "solid-js";

export function addKeyDownEventListener(callback: (event: KeyboardEvent) => Promise<void>) {
  const listener = (event: KeyboardEvent) => {
    callback(event).catch((e: unknown) => {
      throw e;
    });
  };

  window.addEventListener("keydown", listener);

  onCleanup(() => {
    window.removeEventListener("keydown", listener);
  });
}
