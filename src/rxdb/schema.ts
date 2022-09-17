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
