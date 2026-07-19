/* eslint-disable no-relative-import-paths/no-relative-import-paths */
import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequestPost as startPost } from "./start";
import { onRequestPost as stopPost } from "./stop";
import { onRequestGet as candidatesGet } from "./switch-candidates";
import { onRequestPost as switchPost } from "./switch";

type Handler = typeof startPost;

function makeContext(opts: { method: "POST" | "GET"; auth?: string; body?: unknown; invalidJson?: boolean }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth) headers.Authorization = opts.auth;
  const init: RequestInit = { method: opts.method, headers };
  if (opts.method === "POST") init.body = opts.invalidJson ? "not json" : JSON.stringify(opts.body ?? {});
  return {
    request: new Request("https://localhost/api/lifelog/x", init),
    env: { FIRESTORE_PROJECT_ID: "demo", FIRESTORE_EMULATOR_HOST: "localhost:8080" },
    params: {},
    waitUntil: () => {},
    passThroughOnException: () => {},
    next: () => new Response(),
    data: {},
    functionPath: "",
  } as unknown as Parameters<Handler>[0];
}

// A minimal Firestore REST stub keyed by the `:method` suffix of the URL.
function firestoreFetch(responses: { runQuery?: unknown[]; batchGet?: unknown[]; commit?: { status: number; body?: unknown } }) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const method = url.slice(url.lastIndexOf(":") + 1);
    const json = (value: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status }));
    switch (method) {
      case "beginTransaction":
        return json({ transaction: "tx" });
      case "rollback":
        return json({});
      case "batchGet":
        return json(responses.batchGet ?? []);
      case "runQuery":
        return json(responses.runQuery ?? []);
      case "commit":
        return json(responses.commit?.body ?? {}, responses.commit?.status ?? 200);
      default:
        return json({});
    }
  });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("POST /api/lifelog/start", () => {
  it("401 without an Authorization header, and never touches Firestore", async () => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("must not fetch");
    });
    const res = await startPost(makeContext({ method: "POST" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, reason: "unauthorized" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("200 with {ok:true,id} on the happy path (empty timeline)", async () => {
    globalThis.fetch = firestoreFetch({ batchGet: [], runQuery: [], commit: { status: 200 } });
    const res = await startPost(makeContext({ method: "POST", auth: "Bearer token" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; id: string };
    expect(data.ok).toBe(true);
    expect(typeof data.id).toBe("string");
  });

  it("503 when the commit stays contended", async () => {
    globalThis.fetch = firestoreFetch({
      batchGet: [],
      runQuery: [],
      commit: { status: 409, body: { error: { status: "ABORTED" } } },
    });
    const res = await startPost(makeContext({ method: "POST", auth: "Bearer token" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: "contention" });
  });
});

describe("POST /api/lifelog/stop", () => {
  it("409 when there is no open entry", async () => {
    globalThis.fetch = firestoreFetch({ batchGet: [], runQuery: [] });
    const res = await stopPost(makeContext({ method: "POST", auth: "Bearer token" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, reason: "no open entry" });
  });
});

describe("POST /api/lifelog/switch", () => {
  it("400 when sourceId is missing", async () => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("must not fetch");
    });
    const res = await switchPost(makeContext({ method: "POST", auth: "Bearer token", body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "bad request" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("400 on invalid JSON body", async () => {
    const res = await switchPost(makeContext({ method: "POST", auth: "Bearer token", invalidJson: true }));
    expect(res.status).toBe(400);
  });

  it("404 when the source entry is not found", async () => {
    globalThis.fetch = firestoreFetch({ batchGet: [], runQuery: [] });
    const res = await switchPost(makeContext({ method: "POST", auth: "Bearer token", body: { sourceId: "missing" } }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, reason: "source not found" });
  });
});

describe("GET /api/lifelog/switch-candidates", () => {
  it("401 without an Authorization header", async () => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("must not fetch");
    });
    const res = await candidatesGet(makeContext({ method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("200 with a candidates array", async () => {
    globalThis.fetch = firestoreFetch({ runQuery: [] });
    const res = await candidatesGet(makeContext({ method: "GET", auth: "Bearer token" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, candidates: [] });
  });
});
