import {
  configYaml,
  setConfigYamlWithStopSyncing,
  syncing,
  startSyncing,
  errors as syncErrors,
} from "@/rxdb/sync/firestore";
import { startTransition } from "solid-js";

export function RxdbFirestoreSyncConfig() {
  return (
    <>
      <div>
        <input
          onInput={(e) =>
            setConfigYamlWithStopSyncing(e.currentTarget.value ?? "")
          }
          value={configYaml()}
        />
      </div>
      <button
        disabled={syncing()}
        onClick={() => startTransition(() => startSyncing())}
      >
        start sync
      </button>
      <pre>{syncErrors().join("\n")}</pre>
    </>
  );
}
