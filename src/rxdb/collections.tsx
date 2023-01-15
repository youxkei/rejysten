import { RxCollection, ExtractDocumentTypeFromTypedRxJsonSchema } from "rxdb";
import { JSX, createResource, createContext, useContext } from "solid-js";

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

        beginAt: { type: "integer", multipleOf: 1 },
        endAt: { type: "integer" },

        updatedAt: { type: "integer" },
      },
      required: ["id", "text", "endAt", "beginAt", "updatedAt"],
      indexes: ["beginAt"],
    },
  },
  locks: {
    schema: {
      title: "lock schema",
      description: "lock",
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: { type: "string", maxLength: 4 },
        isLocked: { type: "boolean" },
      },
      required: ["id", "isLocked"],
    },
  },
} as const;

export type CollectionNameToDocumentType = {
  [CollectionName in keyof typeof collectionCreators]: ExtractDocumentTypeFromTypedRxJsonSchema<
    typeof collectionCreators[CollectionName]["schema"]
  >;
};

export type Collections = {
  [DocumentName in keyof CollectionNameToDocumentType]: RxCollection<
    CollectionNameToDocumentType[DocumentName]
  >;
};

const context = createContext<() => Collections | undefined>();

export function Provider(props: { children: JSX.Element }) {
  const database = useDatabase();

  const [collections] = createResource(database, async (database) => {
    const collections: Collections = await database.addCollections(
      collectionCreators
    );

    return collections;
  });

  const collectionsWithCleanup = () => {
    const cols = collections();

    // if (cols) {
    //   onCleanup(() => {
    //     for (const [_, collection] of Object.entries(cols)) {
    //       collection.destroy();
    //     }
    //   });
    // }

    return cols;
  };

  return (
    <context.Provider value={collectionsWithCleanup}>
      {props.children}
    </context.Provider>
  );
}

export function useCollections() {
  return useContext(context)!;
}
