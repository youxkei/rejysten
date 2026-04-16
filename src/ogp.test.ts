import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchOGPMeta } from "@/ogp";

const SCANNER_ENDPOINT = "https://ogp-scanner.kunon.jp/v2/ogp_info";
const FALLBACK_ENDPOINT = "/api/ogp";

const originalFetch = globalThis.fetch;

type FetchCall = { endpoint: string; body: unknown };

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function endpointOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  throw new Error(`unexpected fetch input: ${String(input)}`);
}

function setupFetch(handler: (endpoint: string, body: unknown) => Response | Promise<Response> | Promise<never>) {
  globalThis.fetch = vi.fn().mockImplementation(async (input: unknown, init?: RequestInit) => {
    const endpoint = endpointOf(input);
    const bodyText = typeof init?.body === "string" ? init.body : "";
    const body: unknown = bodyText ? JSON.parse(bodyText) : undefined;
    return handler(endpoint, body);
  });
}

function getFetchCalls(): FetchCall[] {
  const mockFn = globalThis.fetch as ReturnType<typeof vi.fn>;
  return mockFn.mock.calls.map((args) => {
    const init = args[1] as RequestInit | undefined;
    const endpoint = endpointOf(args[0]);
    const bodyText = typeof init?.body === "string" ? init.body : "";
    const body: unknown = bodyText ? JSON.parse(bodyText) : undefined;
    return { endpoint, body };
  });
}

describe("fetchOGPMeta", () => {
  it("returns ogp:title and ogp:description from ogp-scanner when both present", async () => {
    setupFetch((endpoint) => {
      if (endpoint === SCANNER_ENDPOINT) {
        return Response.json({
          success: true,
          result: {
            title: null,
            description: null,
            ogp: { "og:title": ["A"], "og:description": ["B"] },
          },
        });
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    const result = await fetchOGPMeta("https://example.com");
    expect(result).toEqual({ title: "A", description: "B" });

    const calls = getFetchCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].endpoint).toBe(SCANNER_ENDPOINT);
    expect(calls[0].body).toEqual({ url: "https://example.com" });
  });

  it("falls back to top-level title/description when ogp:title/ogp:description are absent", async () => {
    setupFetch((endpoint) => {
      if (endpoint === SCANNER_ENDPOINT) {
        return Response.json({
          success: true,
          result: { title: "T", description: "D", ogp: {} },
        });
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    const result = await fetchOGPMeta("https://example.com");
    expect(result).toEqual({ title: "T", description: "D" });
  });

  it("calls Cloudflare fallback when ogp-scanner returns {success:false}", async () => {
    setupFetch((endpoint) => {
      if (endpoint === SCANNER_ENDPOINT) {
        return Response.json({ success: false, reason: "whatever" });
      }
      if (endpoint === FALLBACK_ENDPOINT) {
        return Response.json({
          success: true,
          result: { title: null, description: null, ogp: { "og:title": ["from-fallback"] } },
        });
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    const result = await fetchOGPMeta("https://example.com/page");
    expect(result).toEqual({ title: "from-fallback", description: null });

    const calls = getFetchCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].endpoint).toBe(SCANNER_ENDPOINT);
    expect(calls[0].body).toEqual({ url: "https://example.com/page" });
    expect(calls[1].endpoint).toBe(FALLBACK_ENDPOINT);
    expect(calls[1].body).toEqual({ url: "https://example.com/page" });
  });

  it("calls Cloudflare fallback when ogp-scanner throws", async () => {
    setupFetch((endpoint) => {
      if (endpoint === SCANNER_ENDPOINT) {
        return Promise.reject(new Error("network"));
      }
      if (endpoint === FALLBACK_ENDPOINT) {
        return Response.json({
          success: true,
          result: { title: null, description: null, ogp: { "og:title": ["ok"] } },
        });
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    const result = await fetchOGPMeta("https://example.com");
    expect(result).toEqual({ title: "ok", description: null });
    expect(getFetchCalls()).toHaveLength(2);
  });

  it("calls Cloudflare fallback when ogp-scanner returns non-OK HTTP", async () => {
    setupFetch((endpoint) => {
      if (endpoint === SCANNER_ENDPOINT) {
        return new Response("boom", { status: 500 });
      }
      if (endpoint === FALLBACK_ENDPOINT) {
        return Response.json({
          success: true,
          result: { title: null, description: null, ogp: { "og:title": ["ok"] } },
        });
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    const result = await fetchOGPMeta("https://example.com");
    expect(result).toEqual({ title: "ok", description: null });
    expect(getFetchCalls()).toHaveLength(2);
  });

  it("returns null/null when both stages throw", async () => {
    setupFetch(() => Promise.reject(new Error("network")));

    const result = await fetchOGPMeta("https://example.com");
    expect(result).toEqual({ title: null, description: null });
  });

  it("returns null/null when both stages return {success:false}", async () => {
    setupFetch(() => Response.json({ success: false, reason: "nope" }));

    const result = await fetchOGPMeta("https://example.com");
    expect(result).toEqual({ title: null, description: null });
    expect(getFetchCalls()).toHaveLength(2);
  });

  it("sends {\"url\": targetUrl} with Content-Type: application/json to both endpoints", async () => {
    setupFetch((endpoint) => {
      if (endpoint === SCANNER_ENDPOINT) {
        return Response.json({ success: false, reason: "trigger fallback" });
      }
      if (endpoint === FALLBACK_ENDPOINT) {
        return Response.json({
          success: true,
          result: { title: null, description: null, ogp: {} },
        });
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    await fetchOGPMeta("https://example.com/x");

    const mockFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    for (const args of mockFn.mock.calls) {
      const init = args[1] as RequestInit;
      expect(init.method).toBe("POST");
      expect(new Headers(init.headers as HeadersInit).get("Content-Type")).toBe("application/json");
      expect(init.body).toBe(JSON.stringify({ url: "https://example.com/x" }));
    }
  });
});
