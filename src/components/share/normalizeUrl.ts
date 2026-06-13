/**
 * 共有 URL を正規化する。query はそのまま残し、fragment はハッシュルーティング
 * （`#/` 始まり）以外を削除する。`URL.toString()` での再構築は末尾スラッシュ付与や
 * 日本語パスの percent エンコードで保存文字列の表現を変えてしまうので、元の文字列
 * から fragment（と空になった query）だけを切り取って残りをバイト単位で保つ。
 */
export function normalizeUrl(url: string): string {
  const hashIndex = url.indexOf("#");
  const fragment = hashIndex === -1 ? "" : url.slice(hashIndex);
  const withoutFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);

  const queryIndex = withoutFragment.indexOf("?");
  const base = queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? "" : withoutFragment.slice(queryIndex + 1);

  const keptQuery = rawQuery === "" ? "" : "?" + rawQuery;
  const keptFragment = fragment.startsWith("#/") ? fragment : "";

  return base + keptQuery + keptFragment;
}
