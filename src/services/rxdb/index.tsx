import type { Collections } from "@/services/rxdb/collections";
import type { RxDatabase, RxDatabaseCreator } from "rxdb";
import type { DexieStorageInternals } from "rxdb/dist/types/types";
import type { JSXElement } from "solid-js";

import { addRxPlugin, createRxDatabase } from "rxdb";
import { RxDBMigrationPlugin } from "rxdb/plugins/migration";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { Show, createContext, createResource, onCleanup, useContext } from "solid-js";

import { schema } from "@/services/rxdb/collections";

export type RxDBService = {
  database: RxDatabase<Collections>;
  collections: Collections;
};

const context = createContext<RxDBService>();

function createRxDBServiceSignal(databaseCreator$: () => RxDatabaseCreator<DexieStorageInternals>) {
  addRxPlugin(RxDBMigrationPlugin);

  const [database$] = createResource(databaseCreator$, async (databaseCreator) => {
    let database: RxDatabase<Collections> | undefined;

    onCleanup(async () => {
      if (database) {
        await database.destroy();
      }
    });

    database = await createRxDatabase<Collections>(databaseCreator);

    return database;
  });

  const [collections$] = createResource(database$, async (database) => {
    let collections: Collections | undefined;

    onCleanup(async () => {
      if (collections) {
        for (const [, collection] of Object.entries(collections)) {
          await collection.destroy();
        }
      }
    });

    // TODO: somehow type check fails so far
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    collections = await database.addCollections(schema as any);

    return collections;
  });

  return () => {
    const database = database$();
    if (!database) return;

    const collections = collections$();
    if (!collections) return;

    return {
      database,
      collections,
    };
  };
}

export function RxDBServiceProvider(props: { children: JSXElement; databaseCreator?: RxDatabaseCreator<DexieStorageInternals> }) {
  const rxdbService$ = createRxDBServiceSignal(
    () =>
      props.databaseCreator ?? {
        name: "rejysten",
        storage: getRxStorageDexie(),
        eventReduce: true,
      }
  );

  return (
    <Show when={rxdbService$()} keyed>
      {(rxdbService) => <context.Provider value={rxdbService}>{props.children}</context.Provider>}
    </Show>
  );
}

export function useRxDBService() {
  const service = useContext(context);
  if (!service) throw new Error("useRxDBService must be used within RxDBServiceProvider");

  return service;
}
