import { afterEach, describe, expect, it, vi } from "vitest";

const { ogpHandler } = await import("./ogpHandler.js");

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(body, headers = {}) {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, { headers }));
}

function mockFetchError() {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));
}

function createReq(query = {}) {
  return { query };
}

function createRes() {
  const res = {
    _jsonData: null,
    json(data) {
      res._jsonData = data;
      return res;
    },
  };
  return res;
}

describe("Firebase ogpHandler", () => {
  it("returns error when url parameter is missing", async () => {
    const res = createRes();
    await ogpHandler(createReq(), res);
    expect(res._jsonData).toEqual({ error: "missing url" });
  });

  it("extracts og:title from HTML", async () => {
    mockFetch('<html><head><meta property="og:title" content="Example Title"></head></html>', {
      "content-type": "text/html; charset=utf-8",
    });
    const res = createRes();
    await ogpHandler(createReq({ url: "https://example.com/" }), res);
    expect(res._jsonData).toEqual({ title: "Example Title" });
  });

  it("falls back to <title> when no og:title", async () => {
    mockFetch("<html><head><title>HTML Title</title></head></html>", {
      "content-type": "text/html",
    });
    const res = createRes();
    await ogpHandler(createReq({ url: "https://example.com/" }), res);
    expect(res._jsonData).toEqual({ title: "HTML Title" });
  });

  it("prefers og:title over <title>", async () => {
    mockFetch(
      '<html><head><meta property="og:title" content="OG Title"><title>HTML Title</title></head></html>',
      { "content-type": "text/html" },
    );
    const res = createRes();
    await ogpHandler(createReq({ url: "https://example.com/" }), res);
    expect(res._jsonData).toEqual({ title: "OG Title" });
  });

  it("returns null for non-HTML content type", async () => {
    mockFetch('{"key": "value"}', { "content-type": "application/json" });
    const res = createRes();
    await ogpHandler(createReq({ url: "https://example.com/data.json" }), res);
    expect(res._jsonData).toEqual({ title: null });
  });

  it("returns null when fetch fails", async () => {
    mockFetchError();
    const res = createRes();
    await ogpHandler(createReq({ url: "https://unreachable.example.com/" }), res);
    expect(res._jsonData).toEqual({ title: null });
  });

  it("returns null when HTML has no title", async () => {
    mockFetch("<html><head></head><body>No title here</body></html>", {
      "content-type": "text/html",
    });
    const res = createRes();
    await ogpHandler(createReq({ url: "https://example.com/empty" }), res);
    expect(res._jsonData).toEqual({ title: null });
  });

  it("trims whitespace from <title>", async () => {
    mockFetch("<html><head><title>  Spaced Title  </title></head></html>", {
      "content-type": "text/html",
    });
    const res = createRes();
    await ogpHandler(createReq({ url: "https://example.com/" }), res);
    expect(res._jsonData).toEqual({ title: "Spaced Title" });
  });

  it("returns null when content-type header is absent", async () => {
    mockFetch("some body", {});
    const res = createRes();
    await ogpHandler(createReq({ url: "https://example.com/" }), res);
    expect(res._jsonData).toEqual({ title: null });
  });

  it("extracts og:title from a real page (ogp.me)", async () => {
    const res = createRes();
    await ogpHandler(createReq({ url: "https://ogp.me/" }), res);
    expect(res._jsonData).toEqual({ title: "Open Graph protocol" });
  });
});
