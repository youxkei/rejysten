import { addRxPlugin } from "rxdb";
import { RxDBReplicationCouchDBPlugin } from "rxdb/plugins/replication-couchdb";
import { RxDBLeaderElectionPlugin } from "rxdb/plugins/leader-election";
import { RxDBUpdatePlugin } from "rxdb/plugins/update";
import { addPouchPlugin } from "rxdb/plugins/pouchdb";
import { RxDBMigrationPlugin } from "rxdb/plugins/migration";
import PouchDBAdapterIDB from "pouchdb-adapter-idb";
import PouchDBAdapterHTTP from "pouchdb-adapter-http";

export { useRxDatabase } from "@/rxdb/useRxDatabase";
export { useRxCollections } from "@/rxdb/useRxCollections";
export { useRxSubscribe } from "@/rxdb/useRxSubscribe";
export { useRxSync } from "@/rxdb/useRxSync";

addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBReplicationCouchDBPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBMigrationPlugin);
addPouchPlugin(PouchDBAdapterIDB);
addPouchPlugin(PouchDBAdapterHTTP);
