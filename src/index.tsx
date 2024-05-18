import { MultiProvider } from "@solid-primitives/context";
import { render, Suspense } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";

import { StoreServiceProvider } from "@/services/store";

registerSW({ immediate: true });

function App() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <MultiProvider values={[StoreServiceProvider]}>
        <p>Hello, world!</p>
      </MultiProvider>
    </Suspense>
  );
}

if ("virtualKeyboard" in navigator) {
  (navigator as { virtualKeyboard: { overlaysContent: boolean } }).virtualKeyboard.overlaysContent = true;
}

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
