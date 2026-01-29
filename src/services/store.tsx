import { makePersisted } from "@solid-primitives/storage";
import { type JSXElement, useContext, createContext } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { ServiceNotAvailable } from "@/services/error";
import { migrateState, serializeState } from "@/services/store/migration";

const localStorageName = "rejysten.service.store.state";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface State {}

export const initialState = {} as State;

export type StoreService = {
  state: State;
  updateState: (updater: (state: State) => void) => void;
};

const context = createContext<StoreService>();

export function StoreServiceProvider(props: { localStorageNamePostfix?: string; children: JSXElement }) {
  const [state, setState] = makePersisted(createStore<State>(structuredClone(initialState)), {
    storage: window.localStorage,
    name: localStorageName + (props.localStorageNamePostfix ?? ""),
    serialize: serializeState,
    deserialize: migrateState,
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
