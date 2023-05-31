import type { RxCollection, ExtractDocumentTypeFromTypedRxJsonSchema } from "rxdb";

export const schema = {
  stores: {
    schema: {
      title: "store schema",
      description: "store",
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: { type: "string", maxLength: 5, enum: ["const"] },

        mode: { type: "string", enum: ["normal", "insert"] },

        editor: {
          type: "object",
          properties: {
            text: { type: "string" },
            initialPosition: { type: "string", enum: ["start", "end"] },
          },
          required: ["text", "initialPosition"],
        },

        // pane related states
        currentPane: { type: "string", enum: ["actionLogList", "actionLog"] },
        actionLogListPane: {
          type: "object",
          properties: {
            currentActionLogId: { type: "string" },
            focus: { type: "string", enum: ["text", "startAt", "endAt"] },
          },
          required: ["currentActionLogId", "focus"],
        },
        actionLogPane: {
          type: "object",
          properties: {
            currentListItemId: { type: "string" },
          },
          required: ["currentListItemId"],
        },
      },
      required: ["id", "mode", "editor", "currentPane", "actionLogListPane", "actionLogPane"],
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

        startAt: { type: "integer", multipleOf: 1 },
        endAt: { type: "integer", multipleOf: 1 },

        updatedAt: { type: "integer" },
      },
      required: ["id", "text", "startAt", "endAt", "updatedAt"],
      indexes: ["startAt", "endAt"],
    },
  },

  // local collections should not be synced to the server
  localEvents: {
    schema: {
      title: "local event schema",
      description: "local event",
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: { type: "string", maxLength: 5, enum: ["unlock"] },
      },
      required: ["id"],
    },
  },

  // collections for PoCs
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
  tests: {
    schema: {
      title: "test schema",
      description: "test",
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: { type: "string", maxLength: 5, enum: ["const"] },
        num: { type: "number" },
      },
      required: ["id", "num"],
    },
  },
} as const;

export type CollectionNameToDocumentType = {
  [CollectionName in keyof typeof schema]: ExtractDocumentTypeFromTypedRxJsonSchema<(typeof schema)[CollectionName]["schema"]>;
};

export type Collections = {
  [DocumentName in keyof CollectionNameToDocumentType]: RxCollection<CollectionNameToDocumentType[DocumentName]>;
};
