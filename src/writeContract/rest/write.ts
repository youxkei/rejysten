import { type WriteOp } from "../types";
import { type FirestoreFields } from "./types";
import { encodeFields } from "./value";

// A single element of a Firestore REST commit `writes` array
// (https://cloud.google.com/firestore/docs/reference/rest/v1/Write). `update`
// and `updateTransforms` coexist in one write: the field write is applied, then
// the server-time transforms, atomically.
export interface Write {
  update?: { name: string; fields: FirestoreFields };
  delete?: string;
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: { fieldPath: string; setToServerValue: "REQUEST_TIME" }[];
  currentDocument?: { exists: boolean };
}

const DATABASE_ID = "(default)";

export function documentName(projectId: string, collection: string, id: string): string {
  return `projects/${projectId}/databases/${DATABASE_ID}/documents/${collection}/${id}`;
}

function serverTimestamp(fieldPath: string): { fieldPath: string; setToServerValue: "REQUEST_TIME" } {
  return { fieldPath, setToServerValue: "REQUEST_TIME" };
}

// Full-document write with server-managed createdAt/updatedAt — the REST
// equivalent of the SDK `set({..., createdAt: serverTimestamp(), updatedAt:
// serverTimestamp()})`. No updateMask means the document is fully overwritten.
export function createWithTimestamps(name: string, fields: FirestoreFields): Write {
  return {
    update: { name, fields },
    updateTransforms: [serverTimestamp("createdAt"), serverTimestamp("updatedAt")],
  };
}

// Partial write that merges `fields` (masked) and bumps updatedAt, requiring the
// document to already exist — the REST equivalent of the SDK `update()`.
export function updateWithTimestamp(name: string, fields: FirestoreFields): Write {
  return {
    update: { name, fields },
    updateMask: { fieldPaths: Object.keys(fields) },
    updateTransforms: [serverTimestamp("updatedAt")],
    currentDocument: { exists: true },
  };
}

// Raw field write with no server-time transforms — used to copy an ngram
// document verbatim (ngram docs carry no createdAt/updatedAt).
export function setRawFields(name: string, fields: FirestoreFields): Write {
  return { update: { name, fields } };
}

export function deleteDocument(name: string): Write {
  return { delete: name };
}

// Maps a business WriteOp to its REST write. Used for the lifeLogs documents in
// forwardOps: set overwrites the whole doc with fresh timestamps; update merges
// the touched fields; delete removes it.
export function writeOpToWrite(op: WriteOp, projectId: string): Write {
  const name = documentName(projectId, op.collection, op.id);
  switch (op.type) {
    case "set":
      return createWithTimestamps(name, encodeFields(op.data));
    case "update":
      return updateWithTimestamp(name, encodeFields(op.data));
    case "delete":
      return deleteDocument(name);
  }
}
