import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequestPost } from "./ogp";

function createContext(body: unknown, opts: { invalidJson?: boolean } = {}) {
  const requestBody = opts.invalidJson ? "not json" : JSON.stringify(body);
  return {
    request: new Request("https://localhost/api/ogp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    }),
    env: {},
    params: {},
    waitUntil: () => {},
    passThroughOnException: () => {},
    next: () => new Response(),
    data: {},
    functionPath: "",
  } as unknown as Parameters<typeof onRequestPost>[0];
}

type SuccessResponse = {
  success: true;
  result: {
    title: string | null;
    description: string | null;
    ogp: Record<string, string[] | undefined>;
  };
};
type FailureResponse = { success: false; reason: string };

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

    const response = await onRequestPost(createContext({ url: "https://example.com/" }));
    const data = (await response.json()) as SuccessResponse;
    expect(data.success).toBe(true);
    expect(data.result.ogp["og:title"]).toEqual(["Example Title"]);
    expect(data.result.ogp["og:description"]).toBeUndefined();
    expect(data.result.title).toBeNull();
    expect(data.result.description).toBeNull();
  });

  it("extracts <title> tag", async () => {
    mockFetch(200, "<html><head><title>HTML Title</title></head></html>", {
      "content-type": "text/html",
    });

    const response = await onRequestPost(createContext({ url: "https://example.com/" }));
    const data = (await response.json()) as SuccessResponse;
    expect(data.result.title).toBe("HTML Title");
    expect(data.result.ogp).toEqual({});
  });

  it("returns both og:title and <title> when both are present", async () => {
    mockFetch(
      200,
      '<html><head><meta property="og:title" content="OG Title"><title>HTML Title</title></head></html>',
      { "content-type": "text/html" },
    );

    const response = await onRequestPost(createContext({ url: "https://example.com/" }));
    const data = (await response.json()) as SuccessResponse;
    expect(data.result.ogp["og:title"]).toEqual(["OG Title"]);
    expect(data.result.title).toBe("HTML Title");
  });

  it("extracts og:description", async () => {
    mockFetch(
      200,
      '<html><head><meta property="og:description" content="Example Description"></head></html>',
      { "content-type": "text/html" },
    );

    const response = await onRequestPost(createContext({ url: "https://example.com/" }));
    const data = (await response.json()) as SuccessResponse;
    expect(data.result.ogp["og:description"]).toEqual(["Example Description"]);
  });

  it("extracts <meta name=\"description\">", async () => {
    mockFetch(
      200,
      '<html><head><meta name="description" content="Meta desc"></head></html>',
      { "content-type": "text/html" },
    );

    const response = await onRequestPost(createContext({ url: "https://example.com/" }));
    const data = (await response.json()) as SuccessResponse;
    expect(data.result.description).toBe("Meta desc");
  });

  it("returns {success:false} when url body field is missing", async () => {
    const response = await onRequestPost(createContext({}));
    const data = (await response.json()) as FailureResponse;
    expect(data.success).toBe(false);
    expect(data.reason).toBe("Missing url");
  });

  it("returns {success:false} for invalid URL", async () => {
    const response = await onRequestPost(createContext({ url: "not-a-url" }));
    const data = (await response.json()) as FailureResponse;
    expect(data.success).toBe(false);
    expect(data.reason).toBe("Invalid URL");
  });

  it("returns {success:false} for non-http/https URL", async () => {
    const response = await onRequestPost(createContext({ url: "ftp://example.com/file" }));
    const data = (await response.json()) as FailureResponse;
    expect(data.success).toBe(false);
    expect(data.reason).toBe("Only http/https URLs are supported");
  });

  it("returns {success:false} for invalid JSON body", async () => {
    const response = await onRequestPost(createContext(null, { invalidJson: true }));
    const data = (await response.json()) as FailureResponse;
    expect(data.success).toBe(false);
    expect(data.reason).toBe("Invalid JSON body");
  });

  it("returns empty result for non-HTML content type", async () => {
    mockFetch(200, '{"key": "value"}', { "content-type": "application/json" });

    const response = await onRequestPost(createContext({ url: "https://example.com/data.json" }));
    const data = (await response.json()) as SuccessResponse;
    expect(data.success).toBe(true);
    expect(data.result.title).toBeNull();
    expect(data.result.description).toBeNull();
    expect(data.result.ogp).toEqual({});
  });

  it("returns {success:false} when fetch throws", async () => {
    mockFetchError();

    const response = await onRequestPost(createContext({ url: "https://unreachable.example.com/" }));
    const data = (await response.json()) as FailureResponse;
    expect(data.success).toBe(false);
    expect(data.reason).toBe("fetch failed");
  });

  it("returns {success:false} when upstream returns non-OK", async () => {
    mockFetch(500, "", { "content-type": "text/html" });

    const response = await onRequestPost(createContext({ url: "https://example.com/" }));
    const data = (await response.json()) as FailureResponse;
    expect(data.success).toBe(false);
    expect(data.reason).toBe("HTTP 500");
  });

  it("extracts og:title from a real page (ogp.me)", async () => {
    const response = await onRequestPost(createContext({ url: "https://ogp.me/" }));
    const data = (await response.json()) as SuccessResponse;
    expect(data.success).toBe(true);
    expect(data.result.ogp["og:title"]).toEqual(["Open Graph protocol"]);
  });

  it("returns empty result when HTML has no title or meta", async () => {
    mockFetch(200, "<html><head></head><body>nothing here</body></html>", {
      "content-type": "text/html",
    });

    const response = await onRequestPost(createContext({ url: "https://example.com/empty" }));
    const data = (await response.json()) as SuccessResponse;
    expect(data.result.title).toBeNull();
    expect(data.result.description).toBeNull();
    expect(data.result.ogp).toEqual({});
  });
});
