import { createEffect, createSignal, startTransition } from "solid-js";

import { useRxDBSyncFirestoreService } from "@/services/rxdbSync/firestore";

export function RxdbFirestoreSyncConfig() {
  const { configYAML$, syncing$, errors$, setConfigYAMLWithStopSyncing, startSyncing } = useRxDBSyncFirestoreService();
  const [syncButtonDisabled$, setSyncButtonDisabled] = createSignal(false);

  createEffect(() => {
    setSyncButtonDisabled(syncing$());
  });

  return (
    <>
      <div>
        <input onInput={(e) => setConfigYAMLWithStopSyncing(e.currentTarget.value ?? "")} value={configYAML$()} />
      </div>
      <button
        disabled={syncButtonDisabled$()}
        onClick={() => {
          setSyncButtonDisabled(true);
          startTransition(() => {
            startSyncing();
          });
        }}
      >
        start sync
      </button>
      <pre>{errors$().join("\n")}</pre>
    </>
  );
}
