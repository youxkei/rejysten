import { JSX } from "solid-js";
import { addRxPlugin } from "rxdb";
import { RxDBReplicationCouchDBPlugin } from "rxdb/plugins/replication-couchdb";
import { RxDBLeaderElectionPlugin } from "rxdb/plugins/leader-election";
import { RxDBUpdatePlugin } from "rxdb/plugins/update";
import { addPouchPlugin } from "rxdb/plugins/pouchdb";
import { RxDBMigrationPlugin } from "rxdb/plugins/migration";
import PouchDBAdapterIDB from "pouchdb-adapter-idb";
import PouchDBAdapterHTTP from "pouchdb-adapter-http";

import { Provider as DatabaseProvider } from "@/rxdb/database";
import { Provider as CollectionsProvider } from "@/rxdb/collections";

export { useDatabase } from "@/rxdb/database";
export { useCollections } from "@/rxdb/collections";
export { useSubscribe } from "@/rxdb/subscribe";

addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBReplicationCouchDBPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBMigrationPlugin);
addPouchPlugin(PouchDBAdapterIDB);
addPouchPlugin(PouchDBAdapterHTTP);

export function Provider(props: { children: JSX.Element }) {
  return (
    <DatabaseProvider>
      <CollectionsProvider>{props.children}</CollectionsProvider>
    </DatabaseProvider>
  );
}
