import { describe, expect, it } from "vitest";

import { maxUrlQueryNgrams, selectUrlNgramsForQuery } from "@/components/share/urlNgrams";
import { analyzeTextForNgrams } from "@/ngram";

describe("selectUrlNgramsForQuery", () => {
  it("strips the scheme so its ngrams never reach the query", () => {
    const expected = Object.keys(analyzeTextForNgrams("ab.cd/ef").ngramMap);
    expect(selectUrlNgramsForQuery("https://ab.cd/ef")).toEqual(expected);
    expect(selectUrlNgramsForQuery("http://ab.cd/ef")).toEqual(expected);
  });

  it("returns all ngrams for a short URL", () => {
    const ngrams = selectUrlNgramsForQuery("https://x.com/a1");
    expect(ngrams).toEqual(Object.keys(analyzeTextForNgrams("x.com/a1").ngramMap));
    expect(ngrams.length).toBeLessThanOrEqual(maxUrlQueryNgrams);
  });

  it("prefers trailing ngrams when the URL exceeds the limit", () => {
    // Letter-digit pairs (a0a1...m9) make almost every bigram unique
    const path = Array.from({ length: 13 }, (_, letterIndex) =>
      Array.from({ length: 10 }, (_, digit) => `${String.fromCharCode(97 + letterIndex)}${digit}`).join(""),
    ).join("");
    const all = Object.keys(analyzeTextForNgrams(`example.com/${path}`).ngramMap);
    expect(all.length).toBeGreaterThan(maxUrlQueryNgrams);

    const selected = selectUrlNgramsForQuery(`https://example.com/${path}`);
    expect(selected).toHaveLength(maxUrlQueryNgrams);
    expect(selected).toEqual(all.slice(-maxUrlQueryNgrams));
    // The tail of the path (the most selective part) is included
    expect(selected).toContain("m9");
  });

  it("returns an empty array when the URL has no ngrams", () => {
    expect(selectUrlNgramsForQuery("https://a")).toEqual([]);
  });
});
