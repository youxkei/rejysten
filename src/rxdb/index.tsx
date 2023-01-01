import { JSX } from "solid-js";
import { RxDatabaseCreator, addRxPlugin } from "rxdb";
import { RxDBReplicationCouchDBPlugin } from "rxdb/plugins/replication-couchdb";
import { RxDBLeaderElectionPlugin } from "rxdb/plugins/leader-election";
import { RxDBUpdatePlugin } from "rxdb/plugins/update";
import { addPouchPlugin, getRxStoragePouch } from "rxdb/plugins/pouchdb";
import { RxDBMigrationPlugin } from "rxdb/plugins/migration";
import PouchDBAdapterIDB from "pouchdb-adapter-idb";
import PouchDBAdapterHTTP from "pouchdb-adapter-http";

import { Provider as DatabaseProvider } from "@/rxdb/database";
import { Provider as CollectionsProvider } from "@/rxdb/collections";
import { useSync } from "@/rxdb/sync";

export { useDatabase } from "@/rxdb/database";
export {
  Collections,
  CollectionNameToDocumentType,
  useCollections,
} from "@/rxdb/collections";
export { useSubscribe, useSubscribeAll } from "@/rxdb/subscribe";
export {
  configStore as syncConfigStore,
  setConfigWithStopSyncing as setSyncConfigWithStopSyncing,
  syncing,
  startSyncing,
  errors as syncErrors,
} from "@/rxdb/sync";

addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBReplicationCouchDBPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBMigrationPlugin);
addPouchPlugin(PouchDBAdapterIDB);
addPouchPlugin(PouchDBAdapterHTTP);

function Sync() {
  useSync();

  return null;
}

export function Provider(props: {
  databaseCreator?: RxDatabaseCreator;
  children: JSX.Element;
}) {
  return (
    <DatabaseProvider
      databaseCreator={
        props.databaseCreator ?? {
          name: "rejysten",
          storage: getRxStoragePouch("idb"),
        }
      }
    >
      <CollectionsProvider>
        <>
          <Sync />
          {props.children}
        </>
      </CollectionsProvider>
    </DatabaseProvider>
  );
}
