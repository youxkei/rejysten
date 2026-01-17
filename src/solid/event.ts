import { onCleanup } from "solid-js";

import { withOwner } from "@/solid/owner";

export function addKeyDownEventListener(callback: (event: KeyboardEvent) => void) {
  const listener = withOwner((event: KeyboardEvent) => {
    callback(event);
  });

  window.addEventListener("keydown", listener);

  onCleanup(() => {
    window.removeEventListener("keydown", listener);
  });
}
