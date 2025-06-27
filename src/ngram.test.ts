import { describe, test, expect } from "vitest";

import { normalize, splitToChars, analyzeTextForNgrams } from "@/ngram";

describe("ngram", () => {
  describe("normalize", () => {
    test("converts to lowercase", () => {
      expect(normalize("HELLO")).toBe("hello");
      expect(normalize("Hello World")).toBe("hello world");
    });

    test("normalizes to NFKC form", () => {
      expect(normalize("ﬁ")).toBe("fi"); // ligature to separate characters
      expect(normalize("①")).toBe("1"); // circled number to regular number
      expect(normalize("㎡")).toBe("m2"); // square meter symbol to m2
    });

    test("converts full-width katakana to hiragana", () => {
      expect(normalize("カタカナ")).toBe("かたかな");
      expect(normalize("アイウエオ")).toBe("あいうえお");
    });

    test("converts half-width katakana to hiragana", () => {
      expect(normalize("ｶﾀｶﾅ")).toBe("かたかな");
      expect(normalize("ｱｲｳｴｵ")).toBe("あいうえお");
      expect(normalize("ﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟ")).toBe("ぱぴぷぺぽ");
      expect(normalize("ｶﾞｷﾞｸﾞｹﾞｺﾞ")).toBe("がぎぐげご");
    });

    test("handles mixed text correctly", () => {
      expect(normalize("Hello カタカナ")).toBe("hello かたかな");
      expect(normalize("ABC①ＡＢＣ")).toBe("abc1abc");
    });

    test("handles empty string", () => {
      expect(normalize("")).toBe("");
    });

    test("splits emoji ZWJ sequences", () => {
      expect(normalize("👨‍👩‍👧‍👦")).toBe("👨👩👧👦"); // family emoji without ZWJ
      expect(normalize("👨‍💻")).toBe("👨💻"); // man technologist without ZWJ
      expect(normalize("🧑‍🤝‍🧑")).toBe("🧑🤝🧑"); // people holding hands without ZWJ
    });
  });

  describe("splitToChars", () => {
    test("splits ASCII characters", () => {
      expect(splitToChars("hello")).toEqual(["h", "e", "l", "l", "o"]);
      expect(splitToChars("123")).toEqual(["1", "2", "3"]);
    });

    test("splits Japanese characters correctly", () => {
      expect(splitToChars("日本語")).toEqual(["日", "本", "語"]);
      expect(splitToChars("ひらがな")).toEqual(["ひ", "ら", "が", "な"]);
      expect(splitToChars("カタカナ")).toEqual(["カ", "タ", "カ", "ナ"]);
    });

    test("handles emoji correctly", () => {
      expect(splitToChars("👍")).toEqual(["👍"]);
      expect(splitToChars("👨👩👧👦")).toEqual(["👨", "👩", "👧", "👦"]); // family emoji
      expect(splitToChars("🇯🇵")).toEqual(["🇯🇵"]); // flag emoji
    });

    test("handles mixed content", () => {
      expect(splitToChars("Hello日本")).toEqual(["H", "e", "l", "l", "o", "日", "本"]);
      expect(splitToChars("123あいう")).toEqual(["1", "2", "3", "あ", "い", "う"]);
    });

    test("handles empty string", () => {
      expect(splitToChars("")).toEqual([]);
    });
  });

  describe("analyzeTextForNgrams", () => {
    test("calculates ngrams for simple text", () => {
      const result = analyzeTextForNgrams("hello");
      expect(result.ngramMap).toEqual({
        he: true,
        el: true,
        ll: true,
        lo: true,
      });
      expect(result.normalizedText).toBe("hello");
    });

    test("calculates ngrams with normalization", () => {
      const result = analyzeTextForNgrams("HELLO");
      expect(result.ngramMap).toEqual({
        he: true,
        el: true,
        ll: true,
        lo: true,
      });
      expect(result.normalizedText).toBe("hello");
    });

    test("handles spaces as separators", () => {
      const result = analyzeTextForNgrams("hi world");
      expect(result.ngramMap).toEqual({
        hi: true,
        wo: true,
        or: true,
        rl: true,
        ld: true,
      });
      expect(result.normalizedText).toBe("hi world");
    });

    test("handles Japanese text", () => {
      const result = analyzeTextForNgrams("こんにちは");
      expect(result.ngramMap).toEqual({
        こん: true,
        んに: true,
        にち: true,
        ちは: true,
      });
      expect(result.normalizedText).toBe("こんにちは");
    });

    test("converts katakana to hiragana", () => {
      const result = analyzeTextForNgrams("コンニチハ");
      expect(result.ngramMap).toEqual({
        こん: true,
        んに: true,
        にち: true,
        ちは: true,
      });
      expect(result.normalizedText).toBe("こんにちは");
    });

    test("skips single character groups", () => {
      const result = analyzeTextForNgrams("a b c");
      expect(result.ngramMap).toEqual({});
      expect(result.normalizedText).toBe("a b c");
    });

    test("handles empty string", () => {
      const result = analyzeTextForNgrams("");
      expect(result.ngramMap).toEqual({});
      expect(result.normalizedText).toBe("");
    });

    test("handles string with only non-printables", () => {
      const result = analyzeTextForNgrams("   \t\n   ");
      expect(result.ngramMap).toEqual({});
      expect(result.normalizedText).toBe("   \t\n   ");
    });

    test("handles complex mixed text", () => {
      const result = analyzeTextForNgrams("Hello 世界");
      expect(result.ngramMap).toEqual({
        he: true,
        el: true,
        ll: true,
        lo: true,
        世界: true,
      });
      expect(result.normalizedText).toBe("hello 世界");
    });

    test("handles duplicate ngrams", () => {
      const result = analyzeTextForNgrams("ababa");
      expect(result.ngramMap).toEqual({
        ab: true,
        ba: true,
      });
      expect(result.normalizedText).toBe("ababa");
    });

    test("handles emoji correctly", () => {
      const result = analyzeTextForNgrams("👍👎");
      expect(result.ngramMap).toEqual({
        "👍": true,
        "👎": true,
      });
      expect(result.normalizedText).toBe("👍👎");
    });

    test("handles mixed emoji and text", () => {
      const result = analyzeTextForNgrams("hello👍world");
      expect(result.ngramMap).toEqual({
        he: true,
        el: true,
        ll: true,
        lo: true,
        "👍": true,
        wo: true,
        or: true,
        rl: true,
        ld: true,
      });
      expect(result.normalizedText).toBe("hello👍world");
    });

    test("handles complex emoji sequences", () => {
      const result = analyzeTextForNgrams("👨‍👩‍👧‍👦🇯🇵");
      expect(result.ngramMap).toEqual({
        "👨": true,
        "👩": true,
        "👧": true,
        "👦": true,
        "🇯🇵": true,
      });
      expect(result.normalizedText).toBe("👨👩👧👦🇯🇵");
    });
  });
});
