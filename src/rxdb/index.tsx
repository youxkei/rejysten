import { JSX } from "solid-js";
import { RxDatabaseCreator, addRxPlugin } from "rxdb";
import { RxDBLeaderElectionPlugin } from "rxdb/plugins/leader-election";
import { RxDBUpdatePlugin } from "rxdb/plugins/update";
import { RxDBMigrationPlugin } from "rxdb/plugins/migration";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

import { Provider as DatabaseProvider } from "@/rxdb/database";
import { Provider as CollectionsProvider } from "@/rxdb/collections";

addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBMigrationPlugin);

export function Provider(props: {
  databaseCreator?: RxDatabaseCreator;
  children: JSX.Element;
}) {
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
