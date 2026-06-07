import { describe, expect, it } from "vitest";

import { normalizeUrl } from "@/components/share/normalizeUrl";

describe("normalizeUrl", () => {
  it("strips all query params on an unlisted domain without leaving a trailing ?", () => {
    expect(normalizeUrl("https://example.com/a?utm_source=x&utm_medium=y&fbclid=z")).toBe("https://example.com/a");
  });

  it("keeps v on youtube.com and drops the rest", () => {
    expect(normalizeUrl("https://www.youtube.com/watch?v=abc123&utm_source=foo&feature=share")).toBe(
      "https://www.youtube.com/watch?v=abc123",
    );
  });

  it("keeps v, t, and list together on youtube.com", () => {
    expect(normalizeUrl("https://www.youtube.com/watch?v=abc&t=42&list=PL123&si=tracking")).toBe(
      "https://www.youtube.com/watch?v=abc&t=42&list=PL123",
    );
  });

  it("keeps t on youtu.be", () => {
    expect(normalizeUrl("https://youtu.be/abc?t=42&si=tracking")).toBe("https://youtu.be/abc?t=42");
  });

  it("matches subdomains of allowlisted domains", () => {
    expect(normalizeUrl("https://m.youtube.com/watch?v=abc&utm_source=x")).toBe("https://m.youtube.com/watch?v=abc");
  });

  it("does not match lookalike domains of allowlisted ones", () => {
    expect(normalizeUrl("https://fakeyoutube.com/watch?v=abc")).toBe("https://fakeyoutube.com/watch");
  });

  it("drops params whose key merely starts with an allowlisted key", () => {
    expect(normalizeUrl("https://www.youtube.com/watch?v=abc&vi=def")).toBe("https://www.youtube.com/watch?v=abc");
  });

  it("keeps allowed params in original order when interleaved with dropped ones", () => {
    expect(normalizeUrl("https://www.youtube.com/watch?si=x&v=abc&utm_source=y&t=42")).toBe(
      "https://www.youtube.com/watch?v=abc&t=42",
    );
  });

  it("keeps k on amazon.co.jp and drops the rest", () => {
    expect(normalizeUrl("https://www.amazon.co.jp/s?k=test&ref_=nb_sb_noss")).toBe("https://www.amazon.co.jp/s?k=test");
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

  it("strips query params while preserving a hash-routing fragment", () => {
    expect(normalizeUrl("https://example.com/?utm_source=x#/path")).toBe("https://example.com/#/path");
  });

  it("strips query and plain fragment together", () => {
    expect(normalizeUrl("https://example.com/a?utm_source=x#section")).toBe("https://example.com/a");
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

  it("preserves a non-ASCII path byte-exact", () => {
    expect(normalizeUrl("https://ja.wikipedia.org/wiki/日本語?utm_source=x")).toBe(
      "https://ja.wikipedia.org/wiki/日本語",
    );
  });

  it("is idempotent", () => {
    const once = normalizeUrl("https://www.youtube.com/watch?v=a%20b&utm_source=x#anchor");
    expect(normalizeUrl(once)).toBe(once);
  });
});
