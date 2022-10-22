import { createRxDatabase, addRxPlugin } from "rxdb";
import { createResource, createRoot } from "solid-js";

import { RxDBReplicationCouchDBPlugin } from "rxdb/plugins/replication-couchdb";
import { RxDBLeaderElectionPlugin } from "rxdb/plugins/leader-election";
import { RxDBUpdatePlugin } from "rxdb/plugins/update";
import { addPouchPlugin, getRxStoragePouch } from "rxdb/plugins/pouchdb";
import { RxDBMigrationPlugin } from "rxdb/plugins/migration";
import PouchDBAdapterIDB from "pouchdb-adapter-idb";
import PouchDBAdapterHTTP from "pouchdb-adapter-http";

import { Collections } from "@/rxdb/collections";

export const database = createRoot(() => {
  const [database] = createResource(async () => {
    addRxPlugin(RxDBLeaderElectionPlugin);
    addRxPlugin(RxDBReplicationCouchDBPlugin);
    addRxPlugin(RxDBUpdatePlugin);
    addRxPlugin(RxDBMigrationPlugin);
    addPouchPlugin(PouchDBAdapterIDB);
    addPouchPlugin(PouchDBAdapterHTTP);

    return createRxDatabase<Collections>({
      name: "rejysten",
      storage: getRxStoragePouch("idb"),
    });
  });

  return database;
});
