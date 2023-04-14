import type { RxDatabaseCreator } from "rxdb";
import type { JSX } from "solid-js";

import { addRxPlugin } from "rxdb";
import { RxDBLeaderElectionPlugin } from "rxdb/plugins/leader-election";
import { RxDBMigrationPlugin } from "rxdb/plugins/migration";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { RxDBUpdatePlugin } from "rxdb/plugins/update";

import { Provider as CollectionsProvider } from "@/rxdb/collections";
import { Provider as DatabaseProvider } from "@/rxdb/database";

addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBMigrationPlugin);

export function Provider(props: { databaseCreator?: RxDatabaseCreator; children: JSX.Element }) {
  return (
    <DatabaseProvider
      databaseCreator={
        props.databaseCreator ?? {
          name: "rejysten",
          storage: getRxStorageDexie(),
        }
      }
    >
      <CollectionsProvider>
        <>{props.children}</>
      </CollectionsProvider>
    </DatabaseProvider>
  );
}
