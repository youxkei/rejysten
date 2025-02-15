import { deleteApp, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import {
  type Firestore,
  getFirestore,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import YAML from "js-yaml";
import {
  type JSXElement,
  type Setter,
  createMemo,
  createEffect,
  onCleanup,
  createResource,
  Show,
  createContext,
  useContext,
  type Accessor,
  createSignal,
} from "solid-js";
import * as s from "superstruct";

import { ServiceNotAvailable } from "@/services/error";
import { createSubscribeWithSignal } from "@/solid/subscribe";

export type FirebaseService = {
  firestore: Firestore;
  clock$: Accessor<boolean>;
  setClock: Setter<boolean>;
};

export type FirebaseConfig = s.Infer<typeof firebaseConfigSchema>;

const context = createContext<FirebaseService>();

const firebaseConfigSchema = s.object({
  apiKey: s.string(),
  authDomain: s.string(),
  projectId: s.string(),
  storageBucket: s.string(),
  messagingSenderId: s.string(),
  appId: s.string(),
  measurementId: s.string(),
});

export function FirebaseServiceProvoider(props: {
  configYAML: string | undefined;
  setErrors: Setter<string[]>;
  children: JSXElement;
}) {
  const config$ = createMemo(() => {
    if (!props.configYAML) return;

    try {
      const config = YAML.load(props.configYAML);

      s.assert(config, firebaseConfigSchema);

      return config;
    } catch (error) {
      createEffect(() => props.setErrors((errors) => [...errors, `${error}`]));
    }
  });

  const firebase$ = createMemo(() => {
    const config = config$();
    if (!config) return;

    const app = initializeApp(config);
    initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

    if (config.projectId === "demo") {
      connectFirestoreEmulator(getFirestore(app), "localhost", 8080);
    }

    onCleanup(async () => {
      await deleteApp(app);
    });

    return app;
  });

  const authStatus$ = createSubscribeWithSignal((setValue: (value: { signedIn: boolean }) => void) => {
    const config = config$();
    if (!config) return;

    if (config.projectId === "demo") {
      setValue({ signedIn: true });

      return;
    }

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
        // no need to use createEffect because it is after the await
        props.setErrors((errors) => [...errors, `${error}`]);
      }
    },
  );

  const [clock$, setClock] = createSignal(false);

  return (
    <Show when={authed$() && firebase$()} keyed>
      {(firebase) => (
        <context.Provider value={{ firestore: getFirestore(firebase), clock$, setClock }}>
          {props.children}
        </context.Provider>
      )}
    </Show>
  );
}

export function useFirebaseService() {
  const service = useContext(context);
  if (!service) throw new ServiceNotAvailable("Firebase");

  return service;
}
