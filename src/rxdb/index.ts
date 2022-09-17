import { addRxPlugin } from "rxdb";
import { RxDBReplicationCouchDBPlugin } from "rxdb/plugins/replication-couchdb";
import { RxDBLeaderElectionPlugin } from "rxdb/plugins/leader-election";
import { RxDBUpdatePlugin } from "rxdb/plugins/update";
import { addPouchPlugin } from "rxdb/plugins/pouchdb";
import PouchDBAdapterIDB from "pouchdb-adapter-idb";
import PouchDBAdapterHTTP from "pouchdb-adapter-http";

export { useRxCollections } from "./useRxCollections";
export { useRxSubscribe } from "./useRxSubscribe";

addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBReplicationCouchDBPlugin);
addRxPlugin(RxDBUpdatePlugin);
addPouchPlugin(PouchDBAdapterIDB);
addPouchPlugin(PouchDBAdapterHTTP);
