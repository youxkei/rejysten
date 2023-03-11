import { JSX, Suspense } from "solid-js";
import { createRxDatabase, addRxPlugin } from "rxdb";
import { RxDBUpdatePlugin } from "rxdb/plugins/update";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

import { indexedDB, IDBKeyRange } from "fake-indexeddb";

import {
  Collections,
  Provider as CollectionsProvider,
  collectionCreators,
} from "@/rxdb/collections";
import { Provider as DatabaseProvider } from "@/rxdb/database";

addRxPlugin(RxDBUpdatePlugin);

export function TestWithRxDB(props: { tid: string; children: JSX.Element }) {
  return (
    <Suspense fallback={props.tid}>
      <DatabaseProvider
        databaseCreator={{
          name: props.tid,
          storage: getRxStorageDexie({
            indexedDB: indexedDB,
            IDBKeyRange: IDBKeyRange,
          }),
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
    storage: getRxStorageDexie({
      indexedDB: indexedDB,
      IDBKeyRange: IDBKeyRange,
    }),
    ignoreDuplicate: true,
  });

  return database.addCollections(collectionCreators) as Promise<Collections>;
}
