import { RxDatabase, RxDatabaseCreator, createRxDatabase } from "rxdb";
import {
  JSX,
  createResource,
  onCleanup,
  createContext,
  useContext,
} from "solid-js";

import { Collections } from "@/rxdb/collections";

const context = createContext<() => RxDatabase<Collections> | undefined>();

export function Provider(props: {
  databaseCreator: RxDatabaseCreator;
  children: JSX.Element;
}) {
  const [database$] = createResource(
    props.databaseCreator,
    async (databaseCreator) => {
      let database: RxDatabase<Collections> | undefined;

      onCleanup(() => {
        if (database) {
          database.destroy();
        }
      });

      database = await createRxDatabase<Collections>(databaseCreator);

      return database;
    }
  );

  return (
    <context.Provider value={database$}>{props.children}</context.Provider>
  );
}

export function useDatabaseSignal() {
  return useContext(context)!;
}
