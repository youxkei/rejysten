import type { RxDatabase } from "rxdb";
import type { Collections } from "./collections";

import { createRxDatabase } from "rxdb";
import { getRxStoragePouch } from "rxdb/plugins/pouchdb";

let database: RxDatabase<Collections> | undefined;
let error: unknown;

export function useRxDatabase(): RxDatabase<Collections> {
  if (error !== undefined) {
    throw error;
  }

  if (database !== undefined) {
    return database;
  }

  throw (async () => {
    try {
      database = await createRxDatabase<Collections>({
        name: "rejysten",
        storage: getRxStoragePouch("idb"),
      });
    } catch (err) {
      error = err;
    }
  })();
}
