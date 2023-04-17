import type { Collections } from "@/services/rxdb/collections";
import type { RxDatabase, RxDatabaseCreator } from "rxdb";
import type { JSXElement } from "solid-js";

import { addRxPlugin, createRxDatabase } from "rxdb";
import { RxDBMigrationPlugin } from "rxdb/plugins/migration";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { createContext, createResource, onCleanup, useContext } from "solid-js";

import { schema } from "@/services/rxdb/collections";

export type RxDBService = {
  database$: () => RxDatabase<Collections> | undefined;
  collections$: () => Collections | undefined;
};

const context = createContext<RxDBService>();

function createRxDBService(databaseCreator: RxDatabaseCreator) {
  addRxPlugin(RxDBMigrationPlugin);

  const [database$] = createResource(async () => {
    let database: RxDatabase<Collections> | undefined;

    onCleanup(() => {
      if (database) {
        database.destroy();
      }
    });

    database = await createRxDatabase<Collections>(databaseCreator);

    return database;
  });

  const [collections$] = createResource(database$, async (database) => {
    let collections: Collections | undefined;

    onCleanup(() => {
      if (collections) {
        for (const [_, collection] of Object.entries(collections)) {
          collection.destroy();
        }
      }
    });

    collections = await database.addCollections(schema);

    return collections;
  });

  return {
    database$,
    collections$,
  };
}

export function RxDBServiceProvider(props: { children: JSXElement; databaseCreator?: RxDatabaseCreator }) {
  return (
    <context.Provider
      value={createRxDBService(
        props.databaseCreator ?? {
          name: "rejysten",
          storage: getRxStorageDexie(),
        }
      )}
    >
      {props.children}
    </context.Provider>
  );
}

export function useRxDBService() {
  const service = useContext(context);
  if (!service) throw new Error("useRxDBService must be used within RxDBServiceProvider");

  return service;
}
