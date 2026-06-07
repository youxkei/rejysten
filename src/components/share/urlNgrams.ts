import { analyzeTextForNgrams } from "@/ngram";

// 過去共有検索クエリに使う URL ngram の上限。Firestore は equality filter
// ごとの index を zigzag merge join するため、filter 数に比例してクエリが
// 遅くなる。正しさは呼び出し側の「`](url)` 完全一致チェック」が保証する
// ので、ここは候補 doc を絞れるだけの選択性があれば足りる。
export const maxUrlQueryNgrams = 30;

// scheme の bigram は全 URL 共通で選択性がゼロなので、解析前に落とす。
// 部分文字列の bigram は全文の ngramMap に必ず含まれるため、URL のどの
// 部分集合でクエリしても過去共有ノードを取りこぼすことはない。
const schemeRegex = /^https?:\/\//;

/**
 * 過去共有検索クエリ用に URL から選択性の高い ngram を選ぶ。URL は末尾
 * (ID やスラッグ)が最も選択的なので、上限を超える長い URL では後方の
 * ngram を優先する。
 */
export function selectUrlNgramsForQuery(url: string): string[] {
  const { ngramMap } = analyzeTextForNgrams(url.replace(schemeRegex, ""));
  const ngrams = Object.keys(ngramMap);
  return ngrams.length <= maxUrlQueryNgrams ? ngrams : ngrams.slice(-maxUrlQueryNgrams);
}
