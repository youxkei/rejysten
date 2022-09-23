import type { RxCollection, RxDatabase, RxError } from "rxdb";
import type { Todo, Editor, ListItem, ActionLog } from "./schema";

import { createRxDatabase } from "rxdb";
import { getRxStoragePouch } from "rxdb/plugins/pouchdb";

export type Collections = {
  todos: RxCollection<Todo>;
  editors: RxCollection<Editor>;
  listItems: RxCollection<ListItem>;
  actionLogs: RxCollection<ActionLog>;
};

let database: RxDatabase<Collections> | undefined;
let error: unknown;

export function useRxDatabase(): RxDatabase<Collections> {
  if (error !== undefined) {
    throw error;
  }

  if (database !== undefined) {
    return database;
  }

  throw (async function () {
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
