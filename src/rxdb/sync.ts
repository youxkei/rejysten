import {
  createSignal,
  createEffect,
  onCleanup,
  onMount,
  batch,
} from "solid-js";
import { createStore, produce } from "solid-js/store";
import { addRxPlugin } from "rxdb";
import {
  RxDBReplicationCouchDBNewPlugin,
  RxCouchDBNewReplicationState,
} from "rxdb/plugins/replication-couchdb-new";
import { toSnakeCase } from "js-convert-case";

import { useCollections } from "@/rxdb/collections";

addRxPlugin(RxDBReplicationCouchDBNewPlugin);

const [configStore, setConfigStore] = createStore({
  domain: "",
  user: "",
  pass: "",
});

export { configStore };

const [syncing, setSyncing] = createSignal(false);

export { syncing };

const [errors, setErrors] = createSignal([] as string[]);

export { errors };

export function setConfigWithStopSyncing(fields: Partial<typeof configStore>) {
  batch(() => {
    setConfigStore(
      produce((config) => {
        Object.assign(config, fields);
      })
    );

    setSyncing(false);
  });
}

export function startSyncing() {
  batch(() => {
    setSyncing(true);
    setErrors([]);
  });
}

const localStorageKey = "rejysten.rxdbSyncConfig";

function useSyncConfigToLocalStorage() {
  onMount(() => {
    const config = window.localStorage.getItem(localStorageKey);

    if (config) {
      batch(() => {
        setConfigStore(JSON.parse(config));
        startSyncing();
      });
    }
  });

  createEffect(() => {
    window.localStorage.setItem(
      localStorageKey,
      JSON.stringify({
        domain: configStore.domain,
        user: configStore.user,
        pass: configStore.pass,
      })
    );
  });
}

export function useSync() {
  useSyncConfigToLocalStorage();

  const collections = useCollections();

  createEffect(() => {
    const cols = collections();
    if (!cols) {
      return;
    }

    if (!syncing()) {
      return;
    }

    const syncStates = [] as RxCouchDBNewReplicationState<any>[];

    for (const [collectionName, collection] of Object.entries(cols)) {
      const collectionNameSnakeCase = toSnakeCase(collectionName);

      const syncState = collection.syncCouchDBNew({
        url: `https://${configStore.domain}/${collectionNameSnakeCase}`,
        live: true,
        push: {},
        pull: {},

        fetch(input, options) {
          return fetch(input, {
            ...options,
            headers: {
              ...options?.headers,
              Authorization: `Basic ${window.btoa(
                `${configStore.user}:${configStore.pass}`
              )}`,
            },
          });
        },
      });

      syncState.error$.subscribe((error) => {
        setErrors([...errors(), `${collectionName}: ${error}`]);
      });

      syncStates.push(syncState);
    }

    onCleanup(() => {
      for (const syncState of syncStates) {
        syncState.cancel();
      }
    });
  });
}
