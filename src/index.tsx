import { createSignal, Show, Suspense } from "solid-js";
import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";

import { WithEditHistoryPanel } from "@/components/editHistory";
import { LifeLogs } from "@/panes/lifeLogs";
import { Search } from "@/panes/search";
import { Share } from "@/panes/share";
import { ActionsServiceProvider, useActionsService } from "@/services/actions";
import { FirebaseServiceProvider } from "@/services/firebase";
import { FirestoreServiceProvider } from "@/services/firebase/firestore";
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { Toast } from "@/services/toast";
import { addKeyDownEventListener } from "@/solid/event";
import { createIsMobile } from "@/solid/responsive";
import { styles } from "@/styles.css";
import { hourMs, dayMs } from "@/timestamp";

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

function MainContent() {
  const { state, updateState } = useStoreService();
  const {
    panes: { search: searchActions },
  } = useActionsService();
  const isMobile = createIsMobile();

  // Detect share target params and activate share pane
  const params = new URLSearchParams(window.location.search);
  if (params.has("title") || params.has("url") || params.has("text")) {
    updateState((s) => {
      s.panesShare.isActive = true;
    });
  }

  // "/" key handler to open search (when not editing)
  addKeyDownEventListener((event) => {
    if (event.isComposing || event.ctrlKey) return;
    if (state.panesSearch.isActive) return;
    if (document.activeElement instanceof HTMLInputElement) return;
    if (document.activeElement instanceof HTMLTextAreaElement) return;

    if (event.code === "Slash") {
      event.preventDefault();
      searchActions.openSearch();
    }
  });

  return (
    <>
      <WithEditHistoryPanel>
        <Show
          when={state.panesShare.isActive}
          fallback={
            <Show when={state.panesSearch.isActive} fallback={<LifeLogs rangeMs={isMobile() ? dayMs / 2 : dayMs} />}>
              <Search />
            </Show>
          }
        >
          <Share />
        </Show>
      </WithEditHistoryPanel>
      <Toast />
    </>
  );
}

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
                        <MainContent />
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
