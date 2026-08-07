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

// Everything below logs. These endpoints run where nothing can be attached to a
// process and every throw is turned into a bare "internal error" body, so a call
// that leaves no line behind cannot be diagnosed at all -- which is exactly how a
// Firestore 403 on the write path came to need a redeploy to identify.
const LOG_PREFIX = "lifelog firestore";

// The caller's identity as Firestore will judge it, from the token's own claims:
// the uid the rules compare against, and whether it has already expired. The token
// itself is never logged.
function describeCaller(authHeader: string): string {
  // Checked by shape rather than by an undefined element, which the emulator's
  // "Bearer owner" would otherwise produce: a JWT is three dot-separated parts.
  const parts = authHeader.replace(/^Bearer\s+/i, "").split(".");
  if (parts.length !== 3) return "caller=<not a JWT>";
  try {
    const claims = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      user_id?: string;
      sub?: string;
      aud?: string;
      exp?: number;
    };
    const expiresAt = claims.exp === undefined ? "?" : new Date(claims.exp * 1000).toISOString();
    const expired = claims.exp === undefined ? "?" : String(claims.exp * 1000 < Date.now());
    return `caller uid=${claims.user_id ?? claims.sub ?? "?"} aud=${claims.aud ?? "?"} exp=${expiresAt} expired=${expired}`;
  } catch {
    return "caller=<undecodable JWT>";
  }
}

// What the call is about, by shape only: document paths and operations, never field
// values, so a rules denial can be pinned to a document without logging its contents.
function describeBody(method: string, body: unknown): string {
  const shortName = (name: string) => name.slice(name.indexOf("/documents/") + "/documents/".length);
  if (method === "commit") {
    const writes = (body as { writes?: Write[] }).writes ?? [];
    const ops = writes.map((write) => {
      if (write.delete !== undefined) return `delete ${shortName(write.delete)}`;
      const name = write.update ? shortName(write.update.name) : "?";
      const mask = write.updateMask ? `[${write.updateMask.fieldPaths.join(",")}]` : "[all]";
      const precondition = write.currentDocument ? ` exists=${write.currentDocument.exists}` : "";
      return `update ${name}${mask}${precondition}`;
    });
    return `writes=${ops.length}: ${ops.join("; ")}`;
  }
  if (method === "batchGet") {
    return `documents: ${((body as { documents?: string[] }).documents ?? []).map(shortName).join(", ")}`;
  }
  if (method === "runQuery") {
    const query = (body as { structuredQuery?: StructuredQuery; transaction?: string }).structuredQuery;
    const from = (query?.from ?? []).map((entry) => entry.collectionId).join(",");
    const inTransaction = (body as { transaction?: string }).transaction !== undefined;
    return `from=${from} limit=${query?.limit ?? "-"} inTransaction=${inTransaction}`;
  }
  return "";
}

async function firestoreRequest(config: RestConfig, method: string, body: unknown): Promise<Response> {
  const startedAt = Date.now();
  const res = await config.fetch(`${config.baseUrl}:${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: config.authHeader,
    },
    body: JSON.stringify(body),
  });
  const line = `${LOG_PREFIX} ${method} -> ${res.status} in ${Date.now() - startedAt}ms | ${describeBody(method, body)} | ${describeCaller(config.authHeader)}`;
  if (res.ok) console.log(line);
  else console.error(line);
  return res;
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
async function throwForResponse(res: Response, method: string): Promise<never> {
  const detail = await readErrorDetail(res);
  if (res.status === 401) throw new RestUnauthorizedError(detail);
  throw new RestRequestError(res.status, detail, method);
}

export async function beginTransaction(config: RestConfig): Promise<string> {
  const res = await firestoreRequest(config, "beginTransaction", { options: { readWrite: {} } });
  if (!res.ok) await throwForResponse(res, "beginTransaction");
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
  if (!res.ok) await throwForResponse(res, "batchGet");
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
  if (!res.ok) await throwForResponse(res, "runQuery");
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
    // Named before being retried: these are indistinguishable to the caller, which
    // eventually sees "contention", so a rules denial would otherwise masquerade as
    // a busy database for as many attempts as it takes to give up.
    console.error(`${LOG_PREFIX} commit retryable ${res.status} ${status ?? "?"}: ${detail}`);
    return "retry";
  }
  throw new RestRequestError(res.status, detail, "commit");
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
    console.error(`${LOG_PREFIX} transaction attempt ${attempt}/${maxAttempts} did not commit; re-reading`);
  }

  throw new RestContentionError(maxAttempts);
}
