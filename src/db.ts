import type {
  RxCollection,
  RxDatabase,
  RxQuery,
  RxDocument,
  ExtractDocumentTypeFromTypedRxJsonSchema,
} from "rxdb";

import { createRxDatabase, toTypedRxJsonSchema } from "rxdb";
import { getRxStoragePouch, addPouchPlugin } from "rxdb/plugins/pouchdb";
import React from "react";
import PouchDBAdapterIDB from "pouchdb-adapter-idb";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

function id<T>(x: T): T {
  return x;
}

addPouchPlugin(PouchDBAdapterIDB);

const todoSchema = {
  title: "todo schema",
  description: "todo items",
  version: 0,
  primaryKey: "todoId",
  type: "object",
  properties: {
    todoId: {
      type: "string",
      maxLength: 26,
    },
    text: {
      type: "string",
    },
    updatedAt: {
      type: "number",
    },
  },
  required: ["todoId", "text", "updatedAt"],
} as const;
const todoSchemaTyped = toTypedRxJsonSchema(todoSchema);

type Todo = ExtractDocumentTypeFromTypedRxJsonSchema<typeof todoSchemaTyped>;

type Collections = {
  todoCollection: RxCollection<Todo>;
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
      todoCollection: {
        schema: todoSchema,
      },
    });

    data = { db, collections };
  })();
}

export function useRxSubscribe<T, U>(query: RxQuery<T, U>, initial: U): U {
  const state: {
    onStorageChange: (() => void) | undefined;
    result: U;
  } = React.useMemo(
    () => ({
      onStorageChange: undefined,
      result: initial,
    }),
    [query]
  );

  React.useEffect(() => {
    const subscription = query.$.subscribe((result) => {
      state.result = result;
      state?.onStorageChange();
    });

    return () => subscription.unsubscribe();
  }, [state]);

  const sub = React.useCallback(
    (onStorageChange: () => void) => {
      state.onStorageChange = onStorageChange;

      return () => {
        state.onStorageChange = undefined;
      };
    },
    [state]
  );

  const getSnapshot = React.useCallback(() => state.result, [state]);

  return useSyncExternalStoreWithSelector(sub, getSnapshot, getSnapshot, id);
}
