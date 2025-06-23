import moji from "moji";

// Match control and separator characters, but exclude Zero Width Joiner (U+200D) to preserve emoji sequences
const nonPrintableUnicodeRegex = /(?![\u200D])[\p{C}\p{Z}]/gu;
const segmenter = new Intl.Segmenter();

export function normalize(text: string) {
  return moji(text.normalize("NFKC").toLowerCase()).convert("KK", "HG").toString();
}

export function stripNonPrintables(text: string) {
  return text.replace(nonPrintableUnicodeRegex, "");
}

export function splitByNonPrintables(text: string) {
  return text.split(nonPrintableUnicodeRegex);
}

export function splitToChars(text: string) {
  const segmented = segmenter.segment(text);
  return [...segmented[Symbol.iterator]().map((segment) => segment.segment)];
}

export function calcBigramMap(text: string): Partial<Record<string, true>> {
  const charGroups = splitByNonPrintables(normalize(text)).map((text) => splitToChars(text));

  const bigramMap = {} as Partial<Record<string, true>>;
  // Comprehensive emoji regex that includes emoji sequences with ZWJ and regional indicators
  const emojiRegex = /(\p{Extended_Pictographic}|\p{Regional_Indicator}{2})/u;

  for (const chars of charGroups) {
    if (chars.length < 2) continue;

    for (let i = 0; i < chars.length - 1; i++) {
      // If current character is an emoji, add it as a single character
      if (emojiRegex.test(chars[i])) {
        bigramMap[chars[i]] = true;
      }
      // If next character is an emoji, add it as a single character
      if (i === chars.length - 2 && emojiRegex.test(chars[i + 1])) {
        bigramMap[chars[i + 1]] = true;
      }
      // If neither is an emoji, create normal bigram
      if (!emojiRegex.test(chars[i]) && !emojiRegex.test(chars[i + 1])) {
        const bigramKey = chars[i] + chars[i + 1];
        bigramMap[bigramKey] = true;
      }
    }
  }

  return bigramMap;
}
