import { describe, expect, it } from "vitest";

import { normalizeUrl } from "@/components/share/normalizeUrl";

describe("normalizeUrl", () => {
  it("keeps all query params as-is", () => {
    expect(normalizeUrl("https://example.com/a?utm_source=x&utm_medium=y&fbclid=z")).toBe(
      "https://example.com/a?utm_source=x&utm_medium=y&fbclid=z",
    );
  });

  it("keeps youtube.com query params including tracking ones", () => {
    expect(normalizeUrl("https://www.youtube.com/watch?v=abc123&utm_source=foo&feature=share")).toBe(
      "https://www.youtube.com/watch?v=abc123&utm_source=foo&feature=share",
    );
  });

  it("keeps query param order untouched", () => {
    expect(normalizeUrl("https://www.youtube.com/watch?si=x&v=abc&utm_source=y&t=42")).toBe(
      "https://www.youtube.com/watch?si=x&v=abc&utm_source=y&t=42",
    );
  });

  it("keeps amazon.co.jp search query params", () => {
    expect(normalizeUrl("https://www.amazon.co.jp/s?k=test&ref_=nb_sb_noss")).toBe(
      "https://www.amazon.co.jp/s?k=test&ref_=nb_sb_noss",
    );
  });

  it("strips a plain anchor fragment", () => {
    expect(normalizeUrl("https://example.com/a#section")).toBe("https://example.com/a");
  });

  it("strips a text fragment", () => {
    expect(normalizeUrl("https://example.com/a#:~:text=foo")).toBe("https://example.com/a");
  });

  it("preserves a hash-routing fragment", () => {
    expect(normalizeUrl("https://example.com/#/path/to/thing")).toBe("https://example.com/#/path/to/thing");
  });

  it("keeps query params while preserving a hash-routing fragment", () => {
    expect(normalizeUrl("https://example.com/?utm_source=x#/path")).toBe("https://example.com/?utm_source=x#/path");
  });

  it("keeps query while stripping a plain fragment", () => {
    expect(normalizeUrl("https://example.com/a?utm_source=x#section")).toBe("https://example.com/a?utm_source=x");
  });

  it("treats ? inside a hash-routing fragment as part of the fragment", () => {
    expect(normalizeUrl("https://example.com/#/path?tab=1")).toBe("https://example.com/#/path?tab=1");
  });

  it("removes a dangling ? and #", () => {
    expect(normalizeUrl("https://example.com/a?#")).toBe("https://example.com/a");
  });

  it("keeps an already-clean URL unchanged", () => {
    expect(normalizeUrl("https://www.amazon.co.jp/dp/B0FHPWB4KS")).toBe("https://www.amazon.co.jp/dp/B0FHPWB4KS");
  });

  it("does not append a trailing slash to a bare domain", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("preserves a non-ASCII path and query byte-exact", () => {
    expect(normalizeUrl("https://ja.wikipedia.org/wiki/日本語?utm_source=x")).toBe(
      "https://ja.wikipedia.org/wiki/日本語?utm_source=x",
    );
  });

  it("is idempotent", () => {
    const once = normalizeUrl("https://www.youtube.com/watch?v=a%20b&utm_source=x#anchor");
    expect(normalizeUrl(once)).toBe(once);
  });
});
