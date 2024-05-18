import type { JSXElement } from "solid-js";

import { makePersisted } from "@solid-primitives/storage";
import { useContext, createContext } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { ServiceNotAvailable } from "@/services/error";

export type State = Record<string, never>;

const localStorageName = "rejysten.service.store.state";

const initialState: State = {};

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

if (import.meta.vitest) {
  test.todo("unimplemented");
}
