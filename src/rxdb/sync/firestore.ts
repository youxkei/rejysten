import {
  batch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import YAML from "js-yaml";
import { deleteApp, initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
} from "firebase/auth";
import { getFirestore, collection as getCollection } from "firebase/firestore";
import * as s from "superstruct";
import { replicateFirestore } from "rxdb/plugins/replication-firestore";
import { toSnakeCase } from "js-convert-case";

import { useCollections } from "@/rxdb/collections";
import { createSubscribeResource } from "@/solid/subscribe";

const [configYaml, setConfigYaml] = createSignal("");
export { configYaml };

const [syncing, setSyncing] = createSignal(false);
export { syncing };

const [errors, setErrors] = createSignal([] as string[]);
export { errors };

const FirebaseConfig = s.object({
  apiKey: s.string(),
  authDomain: s.string(),
  projectId: s.string(),
  storageBucket: s.string(),
  messagingSenderId: s.string(),
  appId: s.string(),
  measurementId: s.string(),
});

export function setConfigYamlWithStopSyncing(configYaml: string) {
  batch(() => {
    setSyncing(false);
    setConfigYaml(configYaml);
  });
}

export function startSyncing() {
  batch(() => {
    setSyncing(true);
    setErrors([]);
  });
}

function addErrorWithStopSyncing(error: string) {
  batch(() => {
    setSyncing(false);
    setErrors((errors) => [...errors, error]);
  });
}

const localStorageKey = "rejysten.rxdb.sync.firestore.config";

function useSyncConfigToLocalStorage() {
  onMount(() => {
    const configYaml = window.localStorage.getItem(localStorageKey);

    if (configYaml) {
      batch(() => {
        setConfigYaml(configYaml);
        startSyncing();
      });
    }
  });

  createEffect(() => {
    window.localStorage.setItem(localStorageKey, configYaml());
  });
}

function useSync() {
  useSyncConfigToLocalStorage();

  const collectionsSignal = useCollections();

  const parsedConfigSignal = createMemo(() => {
    if (!syncing()) return;

    return YAML.load(configYaml());
  });

  createEffect(() => {
    const config = parsedConfigSignal();
    if (!config) return;

    const [err] = s.validate(config, FirebaseConfig);

    if (err) {
      addErrorWithStopSyncing(`${err}`);
    }
  });

  const configSignal = () => {
    const config = parsedConfigSignal();
    if (!config) return;

    if (!s.is(config, FirebaseConfig)) return;

    return config;
  };

  const firebaseSignal = createMemo(() => {
    const config = configSignal();
    if (!config) return;

    const app = initializeApp(config);

    onCleanup(() => {
      deleteApp(app);
    });

    return app;
  });

  const signedInResource = createSubscribeResource(
    firebaseSignal,
    (firebase, setValue: (value: boolean) => void) => {
      const unsubscribe = onAuthStateChanged(getAuth(firebase), (user) => {
        if (user) {
          setValue(true);
        } else {
          setValue(false);
        }
      });

      onCleanup(unsubscribe);
    },
    undefined
  );

  const [authResource] = createResource(
    () => {
      const firebase = firebaseSignal();
      if (!firebase) return;

      const signedIn = signedInResource();
      if (signedIn === undefined) return;

      return [firebase, signedIn] as const;
    },
    async ([firebase, signedIn]) => {
      if (signedIn) {
        return true;
      }

      try {
        await signInWithPopup(getAuth(firebase), new GoogleAuthProvider());
        return true;
      } catch (err) {
        return `${err}`;
      }
    }
  );

  createEffect(() => {
    try {
      if (!syncing()) {
        return;
      }

      const collecitons = collectionsSignal();
      if (!collecitons) {
        return;
      }

      const config = configSignal();
      if (!config) {
        return;
      }

      const firebase = firebaseSignal();
      if (!firebase) {
        return;
      }

      const auth = authResource();
      if (auth === undefined) {
        return;
      } else if (auth !== true) {
        addErrorWithStopSyncing(auth);
        return;
      }

      const firestore = getFirestore(firebase);

      for (const [collectionName, collection] of Object.entries(collecitons)) {
        const collectionNameSnakeCase = toSnakeCase(collectionName);
        const firestoreCollection = getCollection(
          firestore,
          collectionNameSnakeCase
        );

        const syncState = replicateFirestore({
          collection: collection,
          firestore: {
            projectId: config.projectId,
            database: firestore,
            collection: firestoreCollection,
          },
          live: true,
          push: {},
          pull: {},
        });

        syncState.error$.subscribe((error) => {
          addErrorWithStopSyncing(`${collectionName}: ${error}`);
        });

        onCleanup(() => {
          syncState.cancel();
        });
      }
    } catch (err) {
      addErrorWithStopSyncing(`${err}`);
      return;
    }
  });
}

export function Sync() {
  useSync();

  return null;
}
