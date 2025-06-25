import moji from "moji";

const nonPrintableRegex = /^[\p{C}\p{Z}]$/u;
const emojiRegex = /^(\p{Extended_Pictographic}|\p{Regional_Indicator}{2})$/u;
const segmenter = new Intl.Segmenter();

export function normalize(text: string) {
  return moji(text.normalize("NFKC").toLowerCase())
    .convert("KK", "HG")
    .toString()
    .replace(/\u200D/g, ""); // Remove ZWJ (Zero Width Joiner) to split emoji sequences
}

export function splitToChars(text: string) {
  const segmented = segmenter.segment(text);
  return [...segmented[Symbol.iterator]().map((segment) => segment.segment)];
}

export function calcBigramMap(text: string): Partial<Record<string, true>> {
  const chars = splitToChars(normalize(text));
  const bigramMap = {} as Partial<Record<string, true>>;

  if (chars.length < 2) return bigramMap;

  for (let i = 0; i < chars.length; i++) {
    // Skip if current character is non-printable
    if (nonPrintableRegex.test(chars[i])) continue;

    // Add individual emoji characters to the map
    if (emojiRegex.test(chars[i])) {
      bigramMap[chars[i]] = true;
      continue;
    }

    // Skip if we're at the last character or the next character is non-printable
    if (i + 1 >= chars.length || nonPrintableRegex.test(chars[i + 1])) continue;

    // Create bigram only if next character is not an emoji
    if (!emojiRegex.test(chars[i + 1])) {
      bigramMap[chars[i] + chars[i + 1]] = true;
    }
  }

  return bigramMap;
}
