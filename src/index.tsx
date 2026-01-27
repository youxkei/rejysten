import { createSignal, Show, Suspense } from "solid-js";
import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";

import { LifeLogs } from "@/panes/lifeLogs";
import { ActionsServiceProvider } from "@/services/actions";
import { FirebaseServiceProvider } from "@/services/firebase";
import { FirestoreServiceProvider } from "@/services/firebase/firestore";
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { styles } from "@/styles.css";
import { dayMs } from "@/timestamp";

registerSW({ immediate: true });

function App() {
  return (
    <StoreServiceProvider>
      {(() => {
        const { state, updateState } = useStoreService();
        const [inputConfigYAML, setInputConfigYAML] = createSignal(state.firebase.configYAML);
        const [errors, setErrors] = createSignal<string[]>([]);

        const applyConfig = () => {
          updateState((s) => {
            s.firebase.configYAML = inputConfigYAML();
          });
        };

        return (
          <div class={styles.app.wrapper}>
            <div class={styles.app.configRow}>
              <input onInput={(e) => setInputConfigYAML(e.currentTarget.value)} value={inputConfigYAML()} />
              <button onClick={applyConfig}>Apply</button>
            </div>
            <pre class={styles.app.errors}>{errors().join("\n")}</pre>
            <Show when={state.firebase.configYAML}>
              <div class={styles.app.main}>
                <Suspense fallback={<p>loading</p>}>
                  <FirebaseServiceProvider configYAML={state.firebase.configYAML} setErrors={setErrors}>
                    <FirestoreServiceProvider>
                      <ActionsServiceProvider>
                        <LifeLogs rangeMs={1 * dayMs} />
                      </ActionsServiceProvider>
                    </FirestoreServiceProvider>
                  </FirebaseServiceProvider>
                </Suspense>
              </div>
            </Show>
          </div>
        );
      })()}
    </StoreServiceProvider>
  );
}

if ("virtualKeyboard" in navigator) {
  (navigator as { virtualKeyboard: { overlaysContent: boolean } }).virtualKeyboard.overlaysContent = true;
}

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
