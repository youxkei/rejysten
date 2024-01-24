import type { JSXElement } from "solid-js";

import YAML from "js-yaml";
import {
  createSignal,
  createResource,
  createEffect,
  createMemo,
  onMount,
  Show,
  batch,
  startTransition,
} from "solid-js";
import * as s from "superstruct";

import { useDexieService } from "@/services/dexie";

export type DexieCloudService = {
  configYAML$: () => string;
  syncing$: () => boolean;
  errors$: () => string[];

  setConfigYAMLWithStopSyncing: (configYAML: string) => void;
  startSyncing: () => void;
};

export type DexieCloudConfig = {
  email: string;
  databaseUrl: string;
  clientId: string;
  clientSecret: string;
};

const dexieCloudConfigSchema: s.Describe<DexieCloudConfig> = s.object({
  email: s.string(),
  databaseUrl: s.string(),
  clientId: s.string(),
  clientSecret: s.string(),
});

const localStorageKey = "rejysten.service.dexieCloud.config";

export function useDexieCloud() {
  const [configYAML$, setConfigYAML] = createSignal("");
  const [syncing$, setSyncing] = createSignal(false);
  const [errors$, setErrors] = createSignal([] as string[]);

  function startSyncing() {
    batch(() => {
      setSyncing(true);
      setErrors([]);
    });
  }

  function setConfigYAMLWithStopSyncing(configYAML: string) {
    batch(() => {
      setSyncing(false);
      setConfigYAML(configYAML);
    });
  }

  function stopSyncingWithError(error: string) {
    setSyncing(false);
    setErrors((errors) => [...errors, error]);
  }

  onMount(() => {
    const configYAML = window.localStorage.getItem(localStorageKey);

    if (configYAML) {
      batch(() => {
        setConfigYAML(configYAML);
        //startSyncing();
      });
    }
  });

  createEffect(() => {
    window.localStorage.setItem(localStorageKey, configYAML$());
  });

  const config$ = createMemo(() => {
    if (!syncing$()) return;

    try {
      const config = YAML.load(configYAML$());

      s.assert(config, dexieCloudConfigSchema);

      return config;
    } catch (error) {
      createEffect(() => stopSyncingWithError(`${error}`));
    }
  });

  function DexieCloudConfig() {
    const [syncButtonDisabled$, setSyncButtonDisabled] = createSignal(false);

    createEffect(() => {
      setSyncButtonDisabled(syncing$());
    });

    return (
      <div>
        <div>
          <input onInput={(e) => setConfigYAMLWithStopSyncing(e.currentTarget.value)} value={configYAML$()} />
        </div>
        <button
          disabled={syncButtonDisabled$()}
          onClick={() => {
            setSyncButtonDisabled(true);
            void startTransition(() => {
              startSyncing();
            });
          }}
        >
          start sync
        </button>
        <pre>{errors$().join("\n")}</pre>
      </div>
    );
  }

  function DexieCloudLogin(props: { children: JSXElement; fallback: JSXElement }) {
    const { db } = useDexieService();

    const [logedIn$] = createResource(config$, async (config) => {
      try {
        db.cloud.configure({
          databaseUrl: config.databaseUrl,
          requireAuth: false,
          tryUseServiceWorker: false,

          fetchTokens: (tokenParams) =>
            fetch(`${config.databaseUrl}/token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                grant_type: "client_credentials",
                scopes: ["ACCESS_DB"],
                public_key: tokenParams.public_key,
                client_id: config.clientId,
                client_secret: config.clientSecret,
                claims: {
                  sub: config.email,
                },
              }),
            }).then((res) => res.json()),
        });

        console.log("currentUserId", db.cloud.currentUserId);

        if (db.cloud.currentUserId != "unauthorized") {
          console.log("syncing");
          await db.cloud.sync({ wait: true, purpose: "pull" });
          console.log("synced");
        } else {
          console.log("logging in");
          await db.cloud.login();
          console.log("logged in");
        }

        return true;
      } catch (error) {
        console.error(error);
        createEffect(() => stopSyncingWithError(`${error}`));
        return false;
      }
    });

    return (
      <Show when={logedIn$()} fallback={props.fallback}>
        {props.children}
      </Show>
    );
  }

  return { config$: () => (syncing$() ? config$() : undefined), DexieCloudConfig, DexieCloudLogin };
}
