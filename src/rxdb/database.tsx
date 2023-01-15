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
  const [database] = createResource(
    props.databaseCreator,
    async (databaseCreator) => {
      const database = await createRxDatabase<Collections>(databaseCreator);

      return database;
    }
  );

  const databaseWithCleanup = () => {
    const db = database();

    if (db) {
      onCleanup(() => {
        db.destroy();
      });
    }

    return db;
  };

  return (
    <context.Provider value={databaseWithCleanup}>
      {props.children}
    </context.Provider>
  );
}

export function useDatabase() {
  return useContext(context)!;
}
