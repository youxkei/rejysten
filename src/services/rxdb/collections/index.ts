import type { RxCollection, ExtractDocumentTypeFromTypedRxJsonSchema } from "rxdb";

export const schema = {
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
        id: { type: "string", maxLength: 5, enum: ["const"] },
        isLocked: { type: "boolean" },
      },
      required: ["id", "isLocked"],
    },
  },
  stores: {
    schema: {
      title: "store schema",
      description: "store",
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: { type: "string", maxLength: 5, enum: ["const"] },
        currentPage: { type: "string", enum: ["actionLogList", "actionLog"] },
        actionLogListPage: {
          type: "object",
          properties: {
            currentActionLogId: { type: "string" },
          },
          required: ["currentActionLogId"],
        },
        actionLogPage: {
          type: "object",
          properties: {
            currentListItemId: { type: "string" },
          },
          required: ["currentListItemId"],
        },
      },
      required: ["id", "currentPage", "actionLogListPage", "actionLogPage"],
    },
  },
} as const;

export type CollectionNameToDocumentType = {
  [CollectionName in keyof typeof schema]: ExtractDocumentTypeFromTypedRxJsonSchema<(typeof schema)[CollectionName]["schema"]>;
};

export type Collections = {
  [DocumentName in keyof CollectionNameToDocumentType]: RxCollection<CollectionNameToDocumentType[DocumentName]>;
};
