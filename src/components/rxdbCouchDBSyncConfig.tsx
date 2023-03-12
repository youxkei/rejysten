import {
  configStore,
  setConfigWithStopSyncing,
  syncing,
  startSyncing,
  errors as syncErrors,
} from "@/rxdb/sync/couchdb";

export function RxdbCouchDBSyncConfig() {
  return (
    <>
      <div>
        <input
          value={configStore.domain}
          onInput={(e) =>
            setConfigWithStopSyncing({ domain: e.currentTarget.value })
          }
        />
        <input
          value={configStore.user}
          onInput={(e) =>
            setConfigWithStopSyncing({ user: e.currentTarget.value })
          }
        />
        <input
          value={configStore.pass}
          onInput={(e) =>
            setConfigWithStopSyncing({ pass: e.currentTarget.value })
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
