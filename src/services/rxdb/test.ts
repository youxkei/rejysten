import type { Collections } from "@/services/rxdb/collections";

import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { createRxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

import { schema } from "@/services/rxdb/collections";

export function createDatabaseCreatorForTest(tid: string) {
  return {
    name: tid,
    storage: getRxStorageDexie({ indexedDB, IDBKeyRange }),
    ignoreDuplicate: true,
  };
}

export async function createCollectionsForTest(tid: string) {
  const database = await createRxDatabase<Collections>({
    name: tid,
    storage: getRxStorageDexie({ indexedDB, IDBKeyRange }),
    ignoreDuplicate: true,
  });

  return database.addCollections(schema) as Promise<Collections>;
}
