import type {
  RxCollection,
  ExtractDocumentTypeFromTypedRxJsonSchema,
} from "rxdb";

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

        prevId: { type: "string", maxLength: 26 },
        nextId: { type: "string", maxLength: 26 },
        parentId: { type: "string", maxLength: 26 },
        text: { type: "string" },

        updatedAt: { type: "integer" },
      },
      required: ["id", "prevId", "nextId", "parentId", "text", "updatedAt"],
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

        beginAt: { type: "integer" },
        endAt: { type: "integer" },
        text: { type: "string" },

        updatedAt: { type: "integer" },
      },
      required: ["id", "beginAt", "endAt", "text", "updatedAt"],
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
