import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequestGet } from "./ogp";

function createContext(url: string) {
  return {
    request: new Request(url),
    env: {},
    params: {},
    waitUntil: () => {},
    passThroughOnException: () => {},
    next: () => new Response(),
    data: {},
    functionPath: "",
  } as unknown as Parameters<typeof onRequestGet>[0];
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(status: number, body: string, headers: Record<string, string> = {}) {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, { status, headers }));
}

function mockFetchError() {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));
}

describe("OGP function", () => {
  it("extracts og:title from HTML", async () => {
    mockFetch(200, '<html><head><meta property="og:title" content="Example Title"></head></html>', {
      "content-type": "text/html; charset=utf-8",
    });

    const response = await onRequestGet(createContext("https://localhost/api/ogp?url=https://example.com/"));
    const data: { title: string | null } = await response.json();
    expect(data.title).toBe("Example Title");
  });

  it("falls back to <title> when no og:title", async () => {
    mockFetch(200, "<html><head><title>HTML Title</title></head></html>", {
      "content-type": "text/html",
    });

    const response = await onRequestGet(createContext("https://localhost/api/ogp?url=https://example.com/"));
    const data: { title: string | null } = await response.json();
    expect(data.title).toBe("HTML Title");
  });

  it("prefers og:title over <title>", async () => {
    mockFetch(
      200,
      '<html><head><meta property="og:title" content="OG Title"><title>HTML Title</title></head></html>',
      { "content-type": "text/html" },
    );

    const response = await onRequestGet(createContext("https://localhost/api/ogp?url=https://example.com/"));
    const data: { title: string | null } = await response.json();
    expect(data.title).toBe("OG Title");
  });

  it("returns 400 when url parameter is missing", async () => {
    const response = await onRequestGet(createContext("https://localhost/api/ogp"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid URL", async () => {
    const response = await onRequestGet(createContext("https://localhost/api/ogp?url=not-a-url"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for non-http/https URL", async () => {
    const response = await onRequestGet(createContext("https://localhost/api/ogp?url=ftp://example.com/file"));
    expect(response.status).toBe(400);
  });

  it("returns null for non-HTML content type", async () => {
    mockFetch(200, '{"key": "value"}', { "content-type": "application/json" });

    const response = await onRequestGet(createContext("https://localhost/api/ogp?url=https://example.com/data.json"));
    const data: { title: string | null } = await response.json();
    expect(data.title).toBeNull();
  });

  it("returns null when fetch fails", async () => {
    mockFetchError();

    const response = await onRequestGet(
      createContext("https://localhost/api/ogp?url=https://unreachable.example.com/"),
    );
    const data: { title: string | null } = await response.json();
    expect(data.title).toBeNull();
  });

  it("extracts og:title from a real page (ogp.me)", async () => {
    const response = await onRequestGet(createContext("https://localhost/api/ogp?url=https://ogp.me/"));
    const data: { title: string | null } = await response.json();
    expect(data.title).toBe("Open Graph protocol");
  });

  it("returns null when HTML has no title", async () => {
    mockFetch(200, "<html><head></head><body>No title here</body></html>", {
      "content-type": "text/html",
    });

    const response = await onRequestGet(createContext("https://localhost/api/ogp?url=https://example.com/empty"));
    const data: { title: string | null } = await response.json();
    expect(data.title).toBeNull();
  });
});
