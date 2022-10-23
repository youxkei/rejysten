import { RxDatabase, createRxDatabase } from "rxdb";
import {
  JSX,
  Resource,
  createResource,
  onCleanup,
  createContext,
  useContext,
} from "solid-js";
import { getRxStoragePouch } from "rxdb/plugins/pouchdb";

import { Collections } from "@/rxdb/collections";

const context = createContext<Resource<RxDatabase<Collections>>>();

export function Provider(props: { children: JSX.Element }) {
  const [database] = createResource(() =>
    createRxDatabase<Collections>({
      name: "rejysten",
      storage: getRxStoragePouch("idb"),
    })
  );

  onCleanup(() => {
    database()?.destroy();
  });

  return <context.Provider value={database}>{props.children}</context.Provider>;
}

export function useDatabase() {
  return useContext(context)!;
}
