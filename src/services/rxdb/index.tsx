import type { Collections } from "@/services/rxdb/collections";
import type { RxDatabase, RxDatabaseCreator } from "rxdb";
import type { DexieStorageInternals } from "rxdb/dist/types/types";
import type { JSXElement } from "solid-js";

import { addRxPlugin, createRxDatabase } from "rxdb";
import { RxDBMigrationPlugin } from "rxdb/plugins/migration";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { Show } from "solid-js";
import { createContext, createResource, onCleanup, useContext } from "solid-js";

import { schema } from "@/services/rxdb/collections";

export type RxDBService = {
  collections: Collections;
};

const context = createContext<RxDBService>();

function createRxDBServiceSignal(databaseCreator$: () => RxDatabaseCreator<DexieStorageInternals>) {
  addRxPlugin(RxDBMigrationPlugin);

  const [database$] = createResource(databaseCreator$, async (databaseCreator) => {
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

    collections = await database.addCollections(schema as any); // TODO: somehow type check fails so far

    return collections;
  });

  return () => {
    const collections = collections$();
    if (!collections) return;

    return {
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
      }
  );

  return (
    <Show when={rxdbService$()}>{(rxdbService$) => <context.Provider value={rxdbService$()}>{props.children}</context.Provider>}</Show>
  );
}

export function useRxDBService() {
  const service = useContext(context);
  if (!service) throw new Error("useRxDBService must be used within RxDBServiceProvider");

  return service;
}
