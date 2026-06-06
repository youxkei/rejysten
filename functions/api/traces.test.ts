/* eslint-disable no-relative-import-paths/no-relative-import-paths */
import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequestPost } from "./traces";

const otlpBody = JSON.stringify({ resourceSpans: [] });

function createContext(env: { OTLP_ENDPOINT?: string; OTLP_HEADERS?: string }, opts: { body?: string } = {}) {
  return {
    request: new Request("https://localhost/api/traces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: opts.body ?? otlpBody,
    }),
    env,
    params: {},
    waitUntil: () => {},
    passThroughOnException: () => {},
    next: () => new Response(),
    data: {},
    functionPath: "",
  } as unknown as Parameters<typeof onRequestPost>[0];
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("traces function", () => {
  it("forwards the payload to the OTLP endpoint with configured headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    const response = await onRequestPost(
      createContext({
        OTLP_ENDPOINT: "https://api.honeycomb.io/v1/traces",
        OTLP_HEADERS: JSON.stringify({ "x-honeycomb-team": "secret-key" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.honeycomb.io/v1/traces",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-honeycomb-team": "secret-key",
        }),
      }),
    );

    const body = fetchMock.mock.calls[0][1].body as ReadableStream;
    expect(await new Response(body).text()).toBe(otlpBody);
  });

  it("forwards without extra headers when OTLP_HEADERS is unset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    const response = await onRequestPost(createContext({ OTLP_ENDPOINT: "https://api.honeycomb.io/v1/traces" }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.honeycomb.io/v1/traces",
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("drops quietly with 204 when OTLP_ENDPOINT is unset", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const response = await onRequestPost(createContext({}));

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops quietly with 204 when OTLP_HEADERS is invalid JSON", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const response = await onRequestPost(
      createContext({ OTLP_ENDPOINT: "https://api.honeycomb.io/v1/traces", OTLP_HEADERS: "not json" }),
    );

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops quietly with 204 when OTLP_HEADERS has non-string values", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const response = await onRequestPost(
      createContext({
        OTLP_ENDPOINT: "https://api.honeycomb.io/v1/traces",
        OTLP_HEADERS: JSON.stringify({ "x-honeycomb-team": 42 }),
      }),
    );

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops quietly with 204 when the payload is oversized", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const body = otlpBody;
    const context = {
      request: new Request("https://localhost/api/traces", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": String(1024 * 1024) },
        body,
      }),
      env: { OTLP_ENDPOINT: "https://api.honeycomb.io/v1/traces" },
    } as unknown as Parameters<typeof onRequestPost>[0];

    const response = await onRequestPost(context);

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the upstream responds with an error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));

    const response = await onRequestPost(createContext({ OTLP_ENDPOINT: "https://api.honeycomb.io/v1/traces" }));

    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream fetch throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    const response = await onRequestPost(createContext({ OTLP_ENDPOINT: "https://api.honeycomb.io/v1/traces" }));

    expect(response.status).toBe(502);
  });
});
