import type { Collections } from "./useRxDatabase";

import { useRxDatabase } from "./useRxDatabase";

import {
  todoSchema,
  editorSchema,
  listItemSchema,
  actionLogSchema,
} from "./schema";

let collections: Collections | undefined;
let error: unknown;

export function useRxCollections(): Collections {
  if (error !== undefined) {
    throw error;
  }

  if (collections !== undefined) {
    return collections;
  }

  const db = useRxDatabase();

  throw (async function () {
    try {
      collections = await db.addCollections({
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
    } catch (err) {
      error = err;
    }
  })();
}
