import { deleteApp, type FirebaseApp, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import YAML from "js-yaml";
import {
  type JSXElement,
  createMemo,
  createEffect,
  onCleanup,
  createResource,
  Show,
  createContext,
  useContext,
} from "solid-js";
import * as s from "superstruct";

import { ServiceNotAvailable } from "@/services/error";
import { initialState, useStoreService } from "@/services/store";
import { createSubscribeWithSignal } from "@/solid/subscribe";

export type FirebaseService = {
  firebaseApp: FirebaseApp;
};

export type FirebaseConfig = s.Infer<typeof firebaseConfigSchema>;

const context = createContext<FirebaseService>();

declare module "@/services/store" {
  interface State {
    servicesFirebase: {
      configYAML: string | undefined;
      errors: string[];
    };
  }
}

initialState.servicesFirebase = {
  configYAML: undefined,
  errors: [],
};

const firebaseConfigSchema = s.object({
  apiKey: s.string(),
  authDomain: s.string(),
  projectId: s.string(),
  storageBucket: s.string(),
  messagingSenderId: s.string(),
  appId: s.string(),
  measurementId: s.string(),
});

export function FirebaseServiceProvoider(props: { children: JSXElement }) {
  const { state, updateState } = useStoreService();

  const config$ = createMemo(() => {
    if (!state.servicesFirebase.configYAML) return;

    try {
      const config = YAML.load(state.servicesFirebase.configYAML);

      s.assert(config, firebaseConfigSchema);

      return config;
    } catch (error) {
      createEffect(() => {
        updateState((state) => {
          state.servicesFirebase.errors = [...state.servicesFirebase.errors, `${error}`];
        });
      });
    }
  });

  const firebaseApp$ = createMemo(() => {
    const config = config$();
    if (!config) return;

    const app = initializeApp(config);

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

    const firebase = firebaseApp$();
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
      const firebase = firebaseApp$();
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
        updateState((state) => {
          state.servicesFirebase.errors = [...state.servicesFirebase.errors, `${error}`];
        });
      }
    },
  );

  return (
    <Show when={authed$() && firebaseApp$()} keyed>
      {(firebaseApp) => {
        return <context.Provider value={{ firebaseApp }}>{props.children}</context.Provider>;
      }}
    </Show>
  );
}

export function useFirebaseService() {
  const service = useContext(context);
  if (!service) throw new ServiceNotAvailable("Firebase");

  return service;
}

export function useFirebaseConfig() {
  const { state, updateState } = useStoreService();

  const setConfigYAML = (configYAML: string) => {
    updateState((state) => {
      state.servicesFirebase.configYAML = configYAML;
    });
  };

  const clearErrors = () => {
    updateState((state) => {
      state.servicesFirebase.errors = [];
    });
  };

  return {
    configYAML$: () => state.servicesFirebase.configYAML,
    errors$: () => state.servicesFirebase.errors,
    setConfigYAML,
    clearErrors,
  };
}
