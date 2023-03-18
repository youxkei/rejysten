import {
  configYaml$,
  syncing$,
  errors$ as syncErrors$,
  setConfigYamlWithStopSyncing,
  startSyncing,
} from "@/rxdb/sync/firestore";
import { createEffect, createSignal, startTransition } from "solid-js";

export function RxdbFirestoreSyncConfig() {
  const [syncButtonDisabledSignal, setSyncButtonDisabled] = createSignal(false);

  createEffect(() => {
    setSyncButtonDisabled(syncing$());
  });

  return (
    <>
      <div>
        <input
          onInput={(e) =>
            setConfigYamlWithStopSyncing(e.currentTarget.value ?? "")
          }
          value={configYaml$()}
        />
      </div>
      <button
        disabled={syncButtonDisabledSignal()}
        onClick={() => {
          setSyncButtonDisabled(true);
          startTransition(() => {
            startSyncing();
          });
        }}
      >
        start sync
      </button>
      <pre>{syncErrors$().join("\n")}</pre>
    </>
  );
}
