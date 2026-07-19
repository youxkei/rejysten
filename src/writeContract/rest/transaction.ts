import { RestRequestError, RestUnauthorizedError, RestContentionError } from "./errors";
import { type FirestoreFields, type RestConfig } from "./types";
import { type Write } from "./write";

export type StructuredQuery = {
  from: { collectionId: string }[];
  orderBy?: { field: { fieldPath: string }; direction: "ASCENDING" | "DESCENDING" }[];
  where?: unknown;
  limit?: number;
};

export interface FoundDocument {
  name: string;
  fields: FirestoreFields;
}

async function firestoreRequest(config: RestConfig, method: string, body: unknown): Promise<Response> {
  return config.fetch(`${config.baseUrl}:${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: config.authHeader,
    },
    body: JSON.stringify(body),
  });
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function firestoreStatus(detail: string): string | undefined {
  try {
    const parsed = JSON.parse(detail) as { error?: { status?: string } };
    return parsed.error?.status;
  } catch {
    return undefined;
  }
}

// Non-OK responses always mean the same thing to the whole transport: 401 is
// unauthorized, anything else is a hard request error. (Commit handles its own
// retryable-contention case before calling this.)
async function throwForResponse(res: Response): Promise<never> {
  const detail = await readErrorDetail(res);
  if (res.status === 401) throw new RestUnauthorizedError(detail);
  throw new RestRequestError(res.status, detail);
}

export async function beginTransaction(config: RestConfig): Promise<string> {
  const res = await firestoreRequest(config, "beginTransaction", { options: { readWrite: {} } });
  if (!res.ok) await throwForResponse(res);
  const json = (await res.json()) as { transaction: string };
  return json.transaction;
}

export async function rollback(config: RestConfig, transaction: string): Promise<void> {
  // Best-effort: a failed rollback just lets the abandoned transaction expire.
  try {
    await firestoreRequest(config, "rollback", { transaction });
  } catch {
    // ignore
  }
}

export async function batchGet(
  config: RestConfig,
  transaction: string,
  names: string[],
): Promise<Map<string, FirestoreFields | null>> {
  const res = await firestoreRequest(config, "batchGet", { documents: names, transaction });
  if (!res.ok) await throwForResponse(res);
  const json = (await res.json()) as { found?: { name: string; fields?: FirestoreFields }; missing?: string }[];

  const result = new Map<string, FirestoreFields | null>();
  for (const entry of json) {
    if (entry.found) {
      result.set(entry.found.name, entry.found.fields ?? {});
    } else if (entry.missing !== undefined) {
      result.set(entry.missing, null);
    }
  }
  return result;
}

export async function runQuery(
  config: RestConfig,
  transaction: string | undefined,
  structuredQuery: StructuredQuery,
): Promise<FoundDocument[]> {
  const body: { structuredQuery: StructuredQuery; transaction?: string } = { structuredQuery };
  if (transaction !== undefined) body.transaction = transaction;
  const res = await firestoreRequest(config, "runQuery", body);
  if (!res.ok) await throwForResponse(res);
  const json = (await res.json()) as { document?: { name: string; fields?: FirestoreFields } }[];

  const documents: FoundDocument[] = [];
  for (const entry of json) {
    if (entry.document) documents.push({ name: entry.document.name, fields: entry.document.fields ?? {} });
  }
  return documents;
}

async function commit(config: RestConfig, transaction: string, writes: Write[]): Promise<"ok" | "retry"> {
  const res = await firestoreRequest(config, "commit", { transaction, writes });
  if (res.ok) return "ok";

  const detail = await readErrorDetail(res);
  if (res.status === 401) throw new RestUnauthorizedError(detail);

  // Serializable-isolation conflicts (a read document changed before commit) and
  // failed existence/CAS preconditions are retryable by re-reading.
  const status = firestoreStatus(detail);
  if (
    res.status === 409 ||
    status === "ABORTED" ||
    status === "FAILED_PRECONDITION" ||
    status === "PERMISSION_DENIED"
  ) {
    return "retry";
  }
  throw new RestRequestError(res.status, detail);
}

export type TransactionBody<T> = (transaction: string) => Promise<{ writes: Write[] | null; value: T }>;

// Runs a read-write transaction: begin → the body reads with the token and
// returns either writes to commit or `null` to roll back (a deterministic
// business abort, e.g. "no open entry"). Commit conflicts re-run the whole body
// with a fresh token up to `maxAttempts`; exhausting them raises contention.
export async function runInTransaction<T>(config: RestConfig, body: TransactionBody<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const transaction = await beginTransaction(config);

    let outcome: { writes: Write[] | null; value: T };
    try {
      outcome = await body(transaction);
    } catch (error) {
      await rollback(config, transaction);
      throw error;
    }

    if (outcome.writes === null) {
      await rollback(config, transaction);
      return outcome.value;
    }

    const result = await commit(config, transaction, outcome.writes);
    if (result === "ok") return outcome.value;
  }

  throw new RestContentionError(maxAttempts);
}
