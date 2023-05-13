import type { Collections } from "@/services/rxdb/collections";
import type { JSXElement } from "solid-js";

import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { createRxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

import { RxDBServiceProvider } from "@/services/rxdb";
import { schema } from "@/services/rxdb/collections";

export function createDatabaseCreatorForTest(tid: string) {
  return {
    name: tid,
    storage: getRxStorageDexie({ indexedDB, IDBKeyRange }),
    eventReduce: true,
    ignoreDuplicate: true,
  };
}

export async function createRxDBServiceForTest(tid: string) {
  const database = await createRxDatabase<Collections>(createDatabaseCreatorForTest(tid));
  // TODO: somehow type check fails so far
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  const collections = (await database.addCollections(schema as any)) as Collections; // TODO: somehow type check fails so far

  return { database, collections };
}

export function RxDBServiceProviderForTest(props: { tid: string; children: JSXElement }) {
  return <RxDBServiceProvider databaseCreator={createDatabaseCreatorForTest(props.tid)}>{props.children}</RxDBServiceProvider>;
}
