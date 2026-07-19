import { describe, it, expect } from "vitest";

import { buildNgramDoc, encodeNgramKeyForFirestore, encodeNgramMapForFirestore } from "@/writeContract/ngramDoc";

describe("encodeNgramKeyForFirestore", () => {
  it("leaves plain ascii bigrams untouched", () => {
    expect(encodeNgramKeyForFirestore("se")).toBe("se");
  });

  it("escapes the field-name-forbidden characters reversibly", () => {
    expect(encodeNgramKeyForFirestore(".")).toBe("_2E");
    expect(encodeNgramKeyForFirestore("%")).toBe("_25");
    expect(encodeNgramKeyForFirestore("/")).toBe("_2F");
    // `_` is escaped first, so a literal already-escaped-looking key round-trips distinctly.
    expect(encodeNgramKeyForFirestore("_2E")).toBe("_5F2E");
  });
});

describe("encodeNgramMapForFirestore", () => {
  it("encodes every key and keeps the values true", () => {
    expect(encodeNgramMapForFirestore({ se: true, ".": true })).toEqual({ se: true, _2E: true });
  });
});

describe("buildNgramDoc", () => {
  it("signals deletion for empty text and still computes the ngram doc id", () => {
    expect(buildNgramDoc("lifeLogs", "abc", "")).toEqual({ action: "delete", ngramId: "abclifeLogs" });
  });

  it("builds the ngram set payload for non-empty text", () => {
    expect(buildNgramDoc("lifeLogs", "abc", "ab")).toEqual({
      action: "set",
      ngramId: "abclifeLogs",
      data: {
        collection: "lifeLogs",
        text: "ab",
        normalizedText: "ab",
        ngramMap: { ab: true },
      },
    });
  });

  it("concatenates id and collection with no separator for the ngram doc id", () => {
    expect(buildNgramDoc("lifeLogTreeNodes", "node1", "x").ngramId).toBe("node1lifeLogTreeNodes");
  });

  it("stores encoded ngram keys in the map", () => {
    // A bigram containing `.` must be stored under its escaped form.
    const result = buildNgramDoc("lifeLogs", "id", "a.");
    expect(result).toMatchObject({ action: "set" });
    if (result.action === "set") {
      expect(Object.keys(result.data.ngramMap)).toContain("a_2E");
    }
  });
});
