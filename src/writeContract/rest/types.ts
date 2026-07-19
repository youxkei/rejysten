// Firestore REST value union (https://cloud.google.com/firestore/docs/reference/rest/v1/Value).
// Only the variants the lifeLog write contract produces/consumes are modelled.
export type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

export type FirestoreFields = Record<string, FirestoreValue>;

// Everything the transport needs to talk to one Firestore database. `baseUrl`
// is the `.../databases/(default)/documents` endpoint (prod or emulator);
// `authHeader` is forwarded verbatim as `Authorization` so Firestore evaluates
// Security Rules against the caller's Firebase ID token (no service account).
// `fetch` is injected so the same code runs under Workers, the browser test
// runner, and Node.
export interface RestConfig {
  fetch: typeof fetch;
  baseUrl: string;
  projectId: string;
  authHeader: string;
}
