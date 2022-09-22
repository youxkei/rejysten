import type { ExtractDocumentTypeFromTypedRxJsonSchema } from "rxdb";

export const todoSchema = {
  title: "todo schema",
  description: "todo items",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 26 },
    text: { type: "string" },
    updatedAt: { type: "number" },
  },
  required: ["id", "text", "updatedAt"],
} as const;
export type Todo = ExtractDocumentTypeFromTypedRxJsonSchema<typeof todoSchema>;

export const editorSchema = {
  title: "editor schema",
  description: "editor",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 26 },
    text: { type: "string" },
    updatedAt: { type: "number" },
  },
  required: ["id", "text", "updatedAt"],
} as const;
export type Editor = ExtractDocumentTypeFromTypedRxJsonSchema<
  typeof editorSchema
>;

export const listItemSchema = {
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

    updatedAt: { type: "number" },
  },
  required: ["id", "prevId", "nextId", "parentId", "text", "updatedAt"],
} as const;
export type ListItem = ExtractDocumentTypeFromTypedRxJsonSchema<
  typeof listItemSchema
>;

export const actionLogSchema = {
  title: "action log schema",
  description: "action logs",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 26 },

    beginAt: { type: "number" },
    endAt: { type: "number" },
    text: { type: "string" },

    updatedAt: { type: "number" },
  },
  required: ["id", "beginAt", "endAt", "text", "updatedAt"],
} as const;
export type ActionLog = ExtractDocumentTypeFromTypedRxJsonSchema<
  typeof actionLogSchema
>;
