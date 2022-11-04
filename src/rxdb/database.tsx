import { RxDatabase, RxDatabaseCreator, createRxDatabase } from "rxdb";
import {
  JSX,
  Resource,
  createResource,
  onCleanup,
  createContext,
  useContext,
} from "solid-js";

import { Collections } from "@/rxdb/collections";

const context = createContext<Resource<RxDatabase<Collections>>>();

export function Provider(props: {
  databaseCreator: RxDatabaseCreator;
  children: JSX.Element;
}) {
  const [database] = createResource(
    props.databaseCreator,
    async (databaseCreator) => {
      const database = await createRxDatabase<Collections>(databaseCreator);

      onCleanup(() => {
        database.destroy();
      });

      return database;
    }
  );

  return <context.Provider value={database}>{props.children}</context.Provider>;
}

export function useDatabase() {
  return useContext(context)!;
}
