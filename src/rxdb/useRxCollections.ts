import type { RxCollection, RxDatabase } from "rxdb";
import type { Todo, Editor } from "./schema";

import { createRxDatabase } from "rxdb";
import { todoSchema, editorSchema } from "./schema";
import { getRxStoragePouch } from "rxdb/plugins/pouchdb";

type Collections = {
  todos: RxCollection<Todo>;
  editors: RxCollection<Editor>;
};

let data:
  | {
      db: RxDatabase<Collections>;
      collections: Collections;
    }
  | undefined;

export function useRxCollections(): Collections {
  if (data !== undefined) {
    return data.collections;
  }

  throw (async function () {
    const db = await createRxDatabase<Collections>({
      name: "db",
      storage: getRxStoragePouch("idb"),
    });

    const collections = await db.addCollections<Collections>({
      todos: {
        schema: todoSchema,
      },
      editors: {
        schema: editorSchema,
      },
    });

    data = { db, collections };
  })();
}
