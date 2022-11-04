import { JSX, Suspense } from "solid-js";
import { createRxDatabase } from "rxdb";
import PouchDBAdapterMemory from "pouchdb-adapter-memory";
import { addPouchPlugin, getRxStoragePouch } from "rxdb/plugins/pouchdb";

import {
  Collections,
  Provider as CollectionsProvider,
  collectionCreators,
} from "@/rxdb/collections";
import { Provider as DatabaseProvider } from "@/rxdb/database";
import {} from "@/rxdb/collections";

addPouchPlugin(PouchDBAdapterMemory);

export function TestWithRxDB(props: { tid: string; children: JSX.Element }) {
  return (
    <Suspense fallback={props.tid}>
      <DatabaseProvider
        databaseCreator={{
          name: props.tid,
          storage: getRxStoragePouch("memory"),
          ignoreDuplicate: true,
        }}
      >
        <CollectionsProvider>{props.children}</CollectionsProvider>
      </DatabaseProvider>
    </Suspense>
  );
}

export async function createCollections(tid: string) {
  const database = await createRxDatabase<Collections>({
    name: tid,
    storage: getRxStoragePouch("memory"),
    ignoreDuplicate: true,
  });

  return database.addCollections(collectionCreators);
}
