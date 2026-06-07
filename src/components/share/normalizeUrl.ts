// 共有 URL の query はトラッキングパラメータであることが多いので原則全削除
// し、コンテンツの同一性に必要なパラメータだけドメイン別に残す。
const queryParamAllowlist: Record<string, readonly string[]> = {
  "youtube.com": ["v", "t", "list"],
  "youtu.be": ["t"],
  // Kindle 検索フォールバック toAmazonJpLink() が s?k= を生成するため k を残す
  "amazon.co.jp": ["k"],
};

function findAllowedParams(hostname: string): readonly string[] {
  for (const [domain, params] of Object.entries(queryParamAllowlist)) {
    if (hostname === domain || hostname.endsWith("." + domain)) return params;
  }
  return [];
}

/**
 * 共有 URL を正規化する。query は許可リストにあるパラメータ以外を削除し、
 * fragment はハッシュルーティング（`#/` 始まり）以外を削除する。
 * `URL.toString()` での再構築は末尾スラッシュ付与や日本語パスの percent
 * エンコードで保存文字列の表現を変えてしまうので、元の文字列から query と
 * fragment の部分だけを切り取って残りをバイト単位で保つ。
 */
export function normalizeUrl(url: string): string {
  // hostname の取得と URL 検証（不正な URL は既存処理と同様に throw する）
  const hostname = new URL(url).hostname;
  const allowedParams = findAllowedParams(hostname);

  const hashIndex = url.indexOf("#");
  const fragment = hashIndex === -1 ? "" : url.slice(hashIndex);
  const withoutFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);

  const queryIndex = withoutFragment.indexOf("?");
  const base = queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? "" : withoutFragment.slice(queryIndex + 1);

  const keptPairs = rawQuery.split("&").filter((pair) => pair !== "" && allowedParams.includes(pair.split("=")[0]));
  const keptQuery = keptPairs.length > 0 ? "?" + keptPairs.join("&") : "";
  const keptFragment = fragment.startsWith("#/") ? fragment : "";

  return base + keptQuery + keptFragment;
}
