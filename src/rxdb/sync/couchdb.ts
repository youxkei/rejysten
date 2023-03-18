import {
  createSignal,
  createEffect,
  onCleanup,
  onMount,
  batch,
} from "solid-js";
import { createStore, produce } from "solid-js/store";
import { replicateCouchDB } from "rxdb/plugins/replication-couchdb";
import { toSnakeCase } from "js-convert-case";

import { useCollectionsSignal } from "@/rxdb/collections";

const [configStore, setConfigStore] = createStore({
  domain: "",
  user: "",
  pass: "",
});

export { configStore };

const [syncing$, setSyncing] = createSignal(false);

export { syncing$ as syncing$ };

const [errors$, setErrors] = createSignal([] as string[]);

export { errors$ as errors$ };

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

const localStorageKey = "rejysten.rxdb.sync.couchdb.config";

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

function useSync() {
  useSyncConfigToLocalStorage();

  const collections$ = useCollectionsSignal();

  createEffect(() => {
    const collections = collections$();
    if (!collections) {
      return;
    }

    if (!syncing$()) {
      return;
    }

    for (const [collectionName, collection] of Object.entries(collections)) {
      const collectionNameSnakeCase = toSnakeCase(collectionName);

      const syncState = replicateCouchDB({
        collection: collection,
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
        setErrors([...errors$(), `${collectionName}: ${error}`]);
      });

      onCleanup(() => {
        syncState.cancel();
      });
    }
  });
}

export function Sync() {
  useSync();

  return null;
}
