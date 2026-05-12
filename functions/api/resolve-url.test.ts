/* eslint-disable no-relative-import-paths/no-relative-import-paths */
import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequestPost } from "./resolve-url";

function createContext(body: unknown, opts: { invalidJson?: boolean } = {}) {
  const requestBody = opts.invalidJson ? "not json" : JSON.stringify(body);
  return {
    request: new Request("https://localhost/api/resolve-url", {
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

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("resolve-url function", () => {
  it("returns Location from a manual redirect", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 301,
        headers: { Location: "https://read.amazon.com/kp/kshare?asin=B0D7DPXQT8&id=share" },
      }),
    );

    const response = await onRequestPost(createContext({ url: "https://a.co/03dKDbGh" }));
    const data = await response.json();
    expect(data).toEqual({
      success: true,
      url: "https://read.amazon.com/kp/kshare?asin=B0D7DPXQT8&id=share",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://a.co/03dKDbGh",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("resolves relative Location against the target URL", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("", {
        status: 302,
        headers: { Location: "/kp/kshare?asin=B0D7DPXQT8" },
      }),
    );

    const response = await onRequestPost(createContext({ url: "https://read.amazon.com/start" }));
    const data = await response.json();
    expect(data.url).toBe("https://read.amazon.com/kp/kshare?asin=B0D7DPXQT8");
  });

  it("returns the response URL when there is no Location", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 200 }));

    const response = await onRequestPost(createContext({ url: "https://example.com/" }));
    const data = await response.json();
    expect(data).toEqual({ success: true, url: "https://example.com/" });
  });

  it("returns {success:false} when url body field is missing", async () => {
    const response = await onRequestPost(createContext({}));
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.reason).toBe("Missing url");
  });

  it("returns {success:false} for invalid URL", async () => {
    const response = await onRequestPost(createContext({ url: "not-a-url" }));
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.reason).toBe("Invalid URL");
  });

  it("returns {success:false} for non-http/https URL", async () => {
    const response = await onRequestPost(createContext({ url: "ftp://example.com/file" }));
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.reason).toBe("Only http/https URLs are supported");
  });

  it("returns {success:false} for invalid JSON body", async () => {
    const response = await onRequestPost(createContext(null, { invalidJson: true }));
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.reason).toBe("Invalid JSON body");
  });

  it("returns {success:false} when fetch throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    const response = await onRequestPost(createContext({ url: "https://unreachable.example.com/" }));
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.reason).toBe("fetch failed");
  });
});
