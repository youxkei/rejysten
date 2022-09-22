import type { RxCollection, RxDatabase } from "rxdb";
import type { Todo, Editor, ListItem, ActionLog } from "./schema";

import { createRxDatabase } from "rxdb";
import {
  todoSchema,
  editorSchema,
  listItemSchema,
  actionLogSchema,
} from "./schema";
import { getRxStoragePouch } from "rxdb/plugins/pouchdb";

type Collections = {
  todos: RxCollection<Todo>;
  editors: RxCollection<Editor>;
  listItems: RxCollection<ListItem>;
  actionLogs: RxCollection<ActionLog>;
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
    try {
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
        listItems: {
          schema: listItemSchema,
        },
        actionLogs: {
          schema: actionLogSchema,
        },
      });
      data = { db, collections };
    } catch (e) {
      console.error(e);
    }
  })();
}
