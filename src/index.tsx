import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";

import { App } from "@/app";
import { beginStartup } from "@/telemetry/startup";
import { hourMs } from "@/timestamp";

// Open the startup window first: phases are buffered as timestamps, so this
// works before the telemetry SDK chunk (dynamic import below) has loaded.
beginStartup();
void import("@/telemetry/provider").then(({ initTelemetry }) => {
  initTelemetry();
});

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
