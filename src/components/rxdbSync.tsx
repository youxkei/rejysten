import {
  syncConfigStore,
  setSyncConfigWithStopSyncing,
  syncing,
  startSyncing,
  syncErrors,
} from "@/rxdb";

export function RxdbSync() {
  return (
    <>
      <div>
        <input
          value={syncConfigStore.domain}
          onInput={(e) =>
            setSyncConfigWithStopSyncing({ domain: e.currentTarget.value })
          }
        />
        <input
          value={syncConfigStore.user}
          onInput={(e) =>
            setSyncConfigWithStopSyncing({ user: e.currentTarget.value })
          }
        />
        <input
          value={syncConfigStore.pass}
          onInput={(e) =>
            setSyncConfigWithStopSyncing({ pass: e.currentTarget.value })
          }
        />
        <button disabled={syncing()} onClick={() => startSyncing()}>
          start sync
        </button>
      </div>
      <pre>{syncErrors().join("\n")}</pre>
    </>
  );
}
