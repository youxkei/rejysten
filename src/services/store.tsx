import { makePersisted } from "@solid-primitives/storage";
import { type JSXElement, useContext, createContext, getOwner, runWithOwner } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { ServiceNotAvailable } from "@/services/error";

const localStorageName = "rejysten.service.store.state";

const initialState = {
  lifeLogs: {
    selectedId: "",
  },
  lock: {
    keyDown: false,
  },
};

export type State = typeof initialState;

export type StoreService = {
  state: State;
  updateState: (updater: (state: State) => void) => void;
};

const context = createContext<StoreService>();

export function StoreServiceProvider(props: { localStorageNamePostfix?: string; children: JSXElement }) {
  const [state, setState] = makePersisted(createStore<State>(structuredClone(initialState)), {
    storage: window.localStorage,
    name: localStorageName + (props.localStorageNamePostfix ?? ""),
  });

  function updateState(updater: (state: State) => void) {
    setState(produce(updater));
  }

  return <context.Provider value={{ state, updateState }}>{props.children}</context.Provider>;
}

export function useStoreService() {
  const service = useContext(context);
  if (!service) throw new ServiceNotAvailable("Store");

  return service;
}

export function addKeyDownEventListenerWithLock(callback: (event: KeyboardEvent) => void) {
  const owner = getOwner();
  const { state } = useStoreService();

  window.addEventListener("keydown", (event) => {
    if (state.lock.keyDown) {
      event.stopImmediatePropagation();

      return;
    }

    runWithOwner(owner, () => {
      callback(event);
    });
  });
}
