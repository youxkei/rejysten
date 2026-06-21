import { describe, expect, it } from "vitest";

import { normalizeUrl } from "@/components/share/normalizeUrl";

describe("normalizeUrl", () => {
  it("strips utm_* and click-id tracking params on any domain, dropping the now-empty query", () => {
    expect(normalizeUrl("https://example.com/a?utm_source=x&utm_medium=y&fbclid=z")).toBe("https://example.com/a");
  });

  it("strips tracking params from the middle while keeping content params and their order", () => {
    expect(normalizeUrl("https://example.com/a?v=abc123&utm_source=foo&page=2&gclid=zz&lang=ja")).toBe(
      "https://example.com/a?v=abc123&page=2&lang=ja",
    );
  });

  it("strips utm_* on youtube while keeping non-tracking params like feature", () => {
    expect(normalizeUrl("https://www.youtube.com/watch?v=abc123&utm_source=foo&feature=share")).toBe(
      "https://www.youtube.com/watch?v=abc123&feature=share",
    );
  });

  it("strips both the youtube si param and utm_*, keeping order of the rest", () => {
    expect(normalizeUrl("https://www.youtube.com/watch?si=x&v=abc&utm_source=y&t=42")).toBe(
      "https://www.youtube.com/watch?v=abc&t=42",
    );
  });

  it("strips si from a youtu.be short link, dropping the now-empty query", () => {
    expect(normalizeUrl("https://youtu.be/abc123?si=AbCdEf123456")).toBe("https://youtu.be/abc123");
  });

  it("strips si but keeps a following timestamp param on youtu.be", () => {
    expect(normalizeUrl("https://youtu.be/abc123?si=AbCdEf&t=90")).toBe("https://youtu.be/abc123?t=90");
  });

  it("strips si from a spotify track link, dropping the now-empty query", () => {
    expect(normalizeUrl("https://open.spotify.com/track/abc123?si=AbCdEf123456")).toBe(
      "https://open.spotify.com/track/abc123",
    );
  });

  it("strips si from a spotify.link short link", () => {
    expect(normalizeUrl("https://spotify.link/abc123?si=xyz")).toBe("https://spotify.link/abc123");
  });

  it("does not strip si from domains that are neither youtube nor spotify", () => {
    expect(normalizeUrl("https://example.com/a?si=x&v=abc")).toBe("https://example.com/a?si=x&v=abc");
  });

  it("does not strip params that merely start with si", () => {
    expect(normalizeUrl("https://www.youtube.com/watch?site=x&v=abc")).toBe(
      "https://www.youtube.com/watch?site=x&v=abc",
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
    expect(normalizeUrl("https://example.com/?id=42#/path")).toBe("https://example.com/?id=42#/path");
  });

  it("keeps query while stripping a plain fragment", () => {
    expect(normalizeUrl("https://example.com/a?id=42#section")).toBe("https://example.com/a?id=42");
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
    expect(normalizeUrl("https://ja.wikipedia.org/wiki/日本語?q=テスト")).toBe(
      "https://ja.wikipedia.org/wiki/日本語?q=テスト",
    );
  });

  it("is idempotent", () => {
    const once = normalizeUrl("https://www.youtube.com/watch?v=a%20b&utm_source=x#anchor");
    expect(normalizeUrl(once)).toBe(once);
  });
});
