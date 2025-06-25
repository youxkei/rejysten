import { describe, test, expect } from "vitest";

import { normalize, splitToChars, calcBigramMap } from "@/bigram";

describe("bigram", () => {
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

  describe("calcBigramMap", () => {
    test("calculates bigrams for simple text", () => {
      const result = calcBigramMap("hello");
      expect(result).toEqual({
        he: true,
        el: true,
        ll: true,
        lo: true,
      });
    });

    test("calculates bigrams with normalization", () => {
      const result = calcBigramMap("HELLO");
      expect(result).toEqual({
        he: true,
        el: true,
        ll: true,
        lo: true,
      });
    });

    test("handles spaces as separators", () => {
      const result = calcBigramMap("hi world");
      expect(result).toEqual({
        hi: true,
        wo: true,
        or: true,
        rl: true,
        ld: true,
      });
    });

    test("handles Japanese text", () => {
      const result = calcBigramMap("こんにちは");
      expect(result).toEqual({
        こん: true,
        んに: true,
        にち: true,
        ちは: true,
      });
    });

    test("converts katakana to hiragana", () => {
      const result = calcBigramMap("コンニチハ");
      expect(result).toEqual({
        こん: true,
        んに: true,
        にち: true,
        ちは: true,
      });
    });

    test("skips single character groups", () => {
      const result = calcBigramMap("a b c");
      expect(result).toEqual({});
    });

    test("handles empty string", () => {
      const result = calcBigramMap("");
      expect(result).toEqual({});
    });

    test("handles string with only non-printables", () => {
      const result = calcBigramMap("   \t\n   ");
      expect(result).toEqual({});
    });

    test("handles complex mixed text", () => {
      const result = calcBigramMap("Hello 世界");
      expect(result).toEqual({
        he: true,
        el: true,
        ll: true,
        lo: true,
        世界: true,
      });
    });

    test("handles duplicate bigrams", () => {
      const result = calcBigramMap("ababa");
      expect(result).toEqual({
        ab: true,
        ba: true,
      });
    });

    test("handles emoji correctly", () => {
      const result = calcBigramMap("👍👎");
      expect(result).toEqual({
        "👍": true,
        "👎": true,
      });
    });

    test("handles mixed emoji and text", () => {
      const result = calcBigramMap("hello👍world");
      expect(result).toEqual({
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
    });

    test("handles complex emoji sequences", () => {
      const result = calcBigramMap("👨‍👩‍👧‍👦🇯🇵");
      expect(result).toEqual({
        "👨": true,
        "👩": true,
        "👧": true,
        "👦": true,
        "🇯🇵": true,
      });
    });
  });
});
