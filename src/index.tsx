import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";

import { App } from "@/app";
import { hourMs } from "@/timestamp";

registerSW({
  immediate: true,
  onRegistered(r) {
    if (r) {
      setInterval(() => {
        void r.update();
      }, hourMs);
    }
  },
});

if ("virtualKeyboard" in navigator) {
  (navigator as { virtualKeyboard: { overlaysContent: boolean } }).virtualKeyboard.overlaysContent = true;
}

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
