import type { Collections } from "@/services/rxdb/collections";
import type { JSXElement } from "solid-js";
import type { Entries } from "type-fest";

import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection as getCollection } from "firebase/firestore";
import YAML from "js-yaml";
import { replicateFirestore } from "rxdb/plugins/replication-firestore";
import { batch, createContext, createEffect, createMemo, createSignal, onMount, useContext, onCleanup, createResource } from "solid-js";
import * as s from "superstruct";

import { ServiceNotAvailable } from "@/services/error";
import { useRxDBService } from "@/services/rxdb";
import { createSubscribeWithSignal } from "@/solid/subscribe";

export type RxDBSyncFirestoreService = {
  configYAML$: () => string;
  syncing$: () => boolean;
  errors$: () => string[];

  setConfigYAMLWithStopSyncing: (configYAML: string) => void;
  startSyncing: () => void;
};

const FirebaseConfig = s.object({
  apiKey: s.string(),
  authDomain: s.string(),
  projectId: s.string(),
  storageBucket: s.string(),
  messagingSenderId: s.string(),
  appId: s.string(),
  measurementId: s.string(),
});

const localStorageKey = "rejysten.service.rxdbSync.firestore.config";

const context = createContext<RxDBSyncFirestoreService>();

export function RxDBSyncFirestoreServiceProvider(props: { children: JSXElement }) {
  const { collections } = useRxDBService();

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
      setConfigYAML(configYAML);
      startSyncing();
    }
  });

  createEffect(() => {
    window.localStorage.setItem(localStorageKey, configYAML$());
  });

  const config$ = createMemo(() => {
    if (!syncing$()) return;

    try {
      const config = YAML.load(configYAML$());

      s.assert(config, FirebaseConfig);

      return config;
    } catch (error) {
      createEffect(() => stopSyncingWithError(`${error}`));
    }
  });

  const firebase$ = createMemo(() => {
    const config = config$();
    if (!config) return;

    const app = initializeApp(config);

    onCleanup(async () => {
      await deleteApp(app);
    });

    return app;
  });

  const authStatus$ = createSubscribeWithSignal((setValue: (value: { signedIn: boolean }) => void) => {
    const firebase = firebase$();
    if (!firebase) return;

    const unsubscribe = onAuthStateChanged(getAuth(firebase), (user) => {
      if (user) {
        setValue({ signedIn: true });
      } else {
        setValue({ signedIn: false });
      }
    });

    onCleanup(unsubscribe);
  }, undefined);

  const [authed$] = createResource(
    () => {
      const firebase = firebase$();
      if (!firebase) return;

      const authStatus = authStatus$();
      if (!authStatus) return;

      return [firebase, authStatus] as const;
    },
    async ([firebase, authStatus]) => {
      if (authStatus.signedIn) {
        return true;
      }

      try {
        await signInWithPopup(getAuth(firebase), new GoogleAuthProvider());
        return true;
      } catch (error) {
        createEffect(() => stopSyncingWithError(`${error}`));
      }
    }
  );

  createEffect(() => {
    if (!syncing$()) return;

    const config = config$();
    if (!config) return;

    const firebase = firebase$();
    if (!firebase) return;

    if (!authed$()) return;

    const firestore = getFirestore(firebase);

    for (const [collectionName, collection] of Object.entries(collections) as Entries<Collections>) {
      if (collectionName.startsWith("local")) continue;

      const firestoreCollection = getCollection(firestore, collectionName);

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
        stopSyncingWithError(`${collectionName}: ${error}`);
      });

      onCleanup(async () => {
        await syncState.cancel();
      });
    }
  });

  return (
    <context.Provider
      value={{
        configYAML$,
        syncing$,
        errors$,
        setConfigYAMLWithStopSyncing,
        startSyncing,
      }}
    >
      {props.children}
    </context.Provider>
  );
}

export function useRxDBSyncFirestoreService() {
  const service = useContext(context);
  if (!service) throw new ServiceNotAvailable("RxDBSyncFirestore");

  return service;
}
