import { describe, test, expect } from "vitest";

import { normalize, stripNonPrintables, splitByNonPrintables, splitToChars, calcBigramMap } from "@/bigram";

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

    test("handles mixed text correctly", () => {
      expect(normalize("Hello カタカナ")).toBe("hello かたかな");
      expect(normalize("ABC①ＡＢＣ")).toBe("abc1abc");
    });

    test("handles empty string", () => {
      expect(normalize("")).toBe("");
    });
  });

  describe("stripNonPrintables", () => {
    test("removes spaces", () => {
      expect(stripNonPrintables("hello world")).toBe("helloworld");
      expect(stripNonPrintables("  spaces  ")).toBe("spaces");
    });

    test("removes tabs and newlines", () => {
      expect(stripNonPrintables("hello\tworld")).toBe("helloworld");
      expect(stripNonPrintables("hello\nworld")).toBe("helloworld");
      expect(stripNonPrintables("hello\r\nworld")).toBe("helloworld");
    });

    test("removes zero-width characters", () => {
      expect(stripNonPrintables("hello\u200Bworld")).toBe("helloworld"); // zero-width space
      expect(stripNonPrintables("hello\u200Cworld")).toBe("helloworld"); // zero-width non-joiner
    });

    test("preserves printable characters", () => {
      expect(stripNonPrintables("abc123")).toBe("abc123");
      expect(stripNonPrintables("日本語")).toBe("日本語");
      expect(stripNonPrintables("!@#$%^&*()")).toBe("!@#$%^&*()");
    });

    test("handles empty string", () => {
      expect(stripNonPrintables("")).toBe("");
    });

    test("handles string with only non-printables", () => {
      expect(stripNonPrintables("   \t\n\r   ")).toBe("");
    });
  });

  describe("splitByNonPrintables", () => {
    test("splits by spaces", () => {
      expect(splitByNonPrintables("hello world")).toEqual(["hello", "world"]);
      expect(splitByNonPrintables("one two three")).toEqual(["one", "two", "three"]);
    });

    test("splits by various whitespace characters", () => {
      expect(splitByNonPrintables("hello\tworld")).toEqual(["hello", "world"]);
      expect(splitByNonPrintables("hello\nworld")).toEqual(["hello", "world"]);
      expect(splitByNonPrintables("hello\r\nworld")).toEqual(["hello", "", "world"]);
    });

    test("handles multiple consecutive non-printables", () => {
      expect(splitByNonPrintables("hello   world")).toEqual(["hello", "", "", "world"]);
      expect(splitByNonPrintables("hello\t\tworld")).toEqual(["hello", "", "world"]);
    });

    test("handles leading and trailing non-printables", () => {
      expect(splitByNonPrintables(" hello world ")).toEqual(["", "hello", "world", ""]);
      expect(splitByNonPrintables("\thello\n")).toEqual(["", "hello", ""]);
    });

    test("handles empty string", () => {
      expect(splitByNonPrintables("")).toEqual([""]);
    });

    test("handles string without non-printables", () => {
      expect(splitByNonPrintables("helloworld")).toEqual(["helloworld"]);
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
      expect(splitToChars("👨‍👩‍👧‍👦")).toEqual(["👨‍👩‍👧‍👦"]); // family emoji
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
        "👨‍👩‍👧‍👦": true,
        "🇯🇵": true,
      });
    });
  });
});
