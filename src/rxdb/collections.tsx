import { RxCollection, ExtractDocumentTypeFromTypedRxJsonSchema } from "rxdb";
import {
  JSX,
  Resource,
  createResource,
  onCleanup,
  createContext,
  useContext,
} from "solid-js";

import { useDatabase } from "@/rxdb/database";

export const collectionCreators = {
  todos: {
    schema: {
      title: "todo schema",
      description: "todo items",
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: { type: "string", maxLength: 26 },
        text: { type: "string" },
        updatedAt: { type: "integer" },
      },
      required: ["id", "text", "updatedAt"],
    },
  },
  editors: {
    schema: {
      title: "editor schema",
      description: "editor",
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: { type: "string", maxLength: 26 },
        text: { type: "string" },
        updatedAt: { type: "integer" },
      },
      required: ["id", "text", "updatedAt"],
    },
  },
  listItems: {
    schema: {
      title: "list item schema",
      description: "list items",
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: { type: "string", maxLength: 26 },

        text: { type: "string" },

        prevId: { type: "string", maxLength: 26 },
        nextId: { type: "string", maxLength: 26 },
        parentId: { type: "string", maxLength: 26 },

        updatedAt: { type: "integer" },
      },
      required: ["id", "text", "nextId", "parentId", "prevId", "updatedAt"],
    },
  },
  actionLogs: {
    schema: {
      title: "action log schema",
      description: "action logs",
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: { type: "string", maxLength: 26 },

        text: { type: "string" },

        beginAt: { type: "integer" },
        endAt: { type: "integer" },

        updatedAt: { type: "integer" },
      },
      required: ["id", "text", "endAt", "beginAt", "updatedAt"],
      indexes: ["beginAt"],
    },
  },
} as const;

export type Collections = {
  [CollectionName in keyof typeof collectionCreators]: RxCollection<
    ExtractDocumentTypeFromTypedRxJsonSchema<
      typeof collectionCreators[CollectionName]["schema"]
    >
  >;
};

const context = createContext<Resource<Collections>>();

export function Provider(props: { children: JSX.Element }) {
  const database = useDatabase();

  const [collections] = createResource(database, async (database) => {
    const collections: Collections = await database.addCollections(
      collectionCreators
    );

    onCleanup(() => {
      for (const [_, collection] of Object.entries(collections)) {
        collection.destroy();
      }
    });

    return collections;
  });

  return (
    <context.Provider value={collections}>{props.children}</context.Provider>
  );
}

export function useCollections() {
  return useContext(context)!;
}
