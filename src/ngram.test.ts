import { describe, it, expect } from "vitest";

import { normalize, splitToChars, analyzeTextForNgrams } from "@/ngram";
import { encodeNgramKeyForFirestore, encodeNgramMapForFirestore } from "@/services/firebase/firestore/ngram";

describe("ngram", () => {
  describe("normalize", () => {
    it("converts to lowercase", () => {
      expect(normalize("HELLO")).toBe("hello");
      expect(normalize("Hello World")).toBe("hello world");
    });

    it("normalizes to NFKC form", () => {
      expect(normalize("ﬁ")).toBe("fi"); // ligature to separate characters
      expect(normalize("①")).toBe("1"); // circled number to regular number
      expect(normalize("㎡")).toBe("m2"); // square meter symbol to m2
    });

    it("converts full-width katakana to hiragana", () => {
      expect(normalize("カタカナ")).toBe("かたかな");
      expect(normalize("アイウエオ")).toBe("あいうえお");
    });

    it("converts half-width katakana to hiragana", () => {
      expect(normalize("ｶﾀｶﾅ")).toBe("かたかな");
      expect(normalize("ｱｲｳｴｵ")).toBe("あいうえお");
      expect(normalize("ﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟ")).toBe("ぱぴぷぺぽ");
      expect(normalize("ｶﾞｷﾞｸﾞｹﾞｺﾞ")).toBe("がぎぐげご");
    });

    it("handles mixed text correctly", () => {
      expect(normalize("Hello カタカナ")).toBe("hello かたかな");
      expect(normalize("ABC①ＡＢＣ")).toBe("abc1abc");
    });

    it("handles empty string", () => {
      expect(normalize("")).toBe("");
    });

    it("splits emoji ZWJ sequences", () => {
      expect(normalize("👨‍👩‍👧‍👦")).toBe("👨👩👧👦"); // family emoji without ZWJ
      expect(normalize("👨‍💻")).toBe("👨💻"); // man technologist without ZWJ
      expect(normalize("🧑‍🤝‍🧑")).toBe("🧑🤝🧑"); // people holding hands without ZWJ
    });
  });

  describe("splitToChars", () => {
    it("splits ASCII characters", () => {
      expect(splitToChars("hello")).toEqual(["h", "e", "l", "l", "o"]);
      expect(splitToChars("123")).toEqual(["1", "2", "3"]);
    });

    it("splits Japanese characters correctly", () => {
      expect(splitToChars("日本語")).toEqual(["日", "本", "語"]);
      expect(splitToChars("ひらがな")).toEqual(["ひ", "ら", "が", "な"]);
      expect(splitToChars("カタカナ")).toEqual(["カ", "タ", "カ", "ナ"]);
    });

    it("handles emoji correctly", () => {
      expect(splitToChars("👍")).toEqual(["👍"]);
      expect(splitToChars("👨👩👧👦")).toEqual(["👨", "👩", "👧", "👦"]); // family emoji
      expect(splitToChars("🇯🇵")).toEqual(["🇯🇵"]); // flag emoji
    });

    it("handles mixed content", () => {
      expect(splitToChars("Hello日本")).toEqual(["H", "e", "l", "l", "o", "日", "本"]);
      expect(splitToChars("123あいう")).toEqual(["1", "2", "3", "あ", "い", "う"]);
    });

    it("handles empty string", () => {
      expect(splitToChars("")).toEqual([]);
    });
  });

  describe("analyzeTextForNgrams", () => {
    it("calculates ngrams for simple text", () => {
      const result = analyzeTextForNgrams("hello");
      expect(result.ngramMap).toEqual({
        he: true,
        el: true,
        ll: true,
        lo: true,
      });
      expect(result.normalizedText).toBe("hello");
    });

    it("calculates ngrams with normalization", () => {
      const result = analyzeTextForNgrams("HELLO");
      expect(result.ngramMap).toEqual({
        he: true,
        el: true,
        ll: true,
        lo: true,
      });
      expect(result.normalizedText).toBe("hello");
    });

    it("handles spaces as separators", () => {
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

    it("handles Japanese text", () => {
      const result = analyzeTextForNgrams("こんにちは");
      expect(result.ngramMap).toEqual({
        こん: true,
        んに: true,
        にち: true,
        ちは: true,
      });
      expect(result.normalizedText).toBe("こんにちは");
    });

    it("converts katakana to hiragana", () => {
      const result = analyzeTextForNgrams("コンニチハ");
      expect(result.ngramMap).toEqual({
        こん: true,
        んに: true,
        にち: true,
        ちは: true,
      });
      expect(result.normalizedText).toBe("こんにちは");
    });

    it("skips single character groups", () => {
      const result = analyzeTextForNgrams("a b c");
      expect(result.ngramMap).toEqual({});
      expect(result.normalizedText).toBe("a b c");
    });

    it("handles empty string", () => {
      const result = analyzeTextForNgrams("");
      expect(result.ngramMap).toEqual({});
      expect(result.normalizedText).toBe("");
    });

    it("handles string with only non-printables", () => {
      const result = analyzeTextForNgrams("   \t\n   ");
      expect(result.ngramMap).toEqual({});
      expect(result.normalizedText).toBe("   \t\n   ");
    });

    it("handles complex mixed text", () => {
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

    it("handles duplicate ngrams", () => {
      const result = analyzeTextForNgrams("ababa");
      expect(result.ngramMap).toEqual({
        ab: true,
        ba: true,
      });
      expect(result.normalizedText).toBe("ababa");
    });

    it("handles emoji correctly", () => {
      const result = analyzeTextForNgrams("👍👎");
      expect(result.ngramMap).toEqual({
        "👍": true,
        "👎": true,
      });
      expect(result.normalizedText).toBe("👍👎");
    });

    it("handles mixed emoji and text", () => {
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

    it("handles complex emoji sequences", () => {
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

    it("indexes a single emoji as a unigram", () => {
      const result = analyzeTextForNgrams("😀");
      expect(result.ngramMap).toEqual({ "😀": true });
      expect(result.normalizedText).toBe("😀");
    });

    it("produces no ngram for a single non-emoji character", () => {
      const result = analyzeTextForNgrams("a");
      expect(result.ngramMap).toEqual({});
      expect(result.normalizedText).toBe("a");
    });
  });

  describe("Firestore ngram keys", () => {
    it("keeps plain ASCII keys readable", () => {
      expect(encodeNgramKeyForFirestore("se")).toBe("se");
    });

    it("does not collide for dots and underscore escape-like input", () => {
      const keys = [".", "_2E", "%", "_25", "/", "_2F", "a._/%"].map(encodeNgramKeyForFirestore);
      expect(new Set(keys).size).toBe(keys.length);
      expect(encodeNgramKeyForFirestore(".")).toBe("_2E");
      expect(encodeNgramKeyForFirestore("_2E")).toBe("_5F2E");
    });

    it("escapes dots, punctuation, Japanese, and emoji for field-path queries", () => {
      expect(
        encodeNgramMapForFirestore({
          "a.": true,
          "o,": true,
          検索: true,
          "😀": true,
        }),
      ).toEqual({
        a_2E: true,
        o_2C: true,
        _E6_A4_9C_E7_B4_A2: true,
        _F0_9F_98_80: true,
      });
    });
  });
});
