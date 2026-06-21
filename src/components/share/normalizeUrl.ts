// コンテンツに無関係で、どのドメインでも削除して安全な既知の追跡パラメータ
// （完全一致するキー）。広告クリック ID や流入計測用で、URL が指す内容には影響しない。
const TRACKING_PARAMS = new Set([
  "fbclid", // Facebook
  "gclid", // Google Ads
  "gbraid", // Google Ads
  "wbraid", // Google Ads
  "dclid", // DoubleClick
  "msclkid", // Microsoft Ads
  "yclid", // Yandex
  "igshid", // Instagram
  "igsh", // Instagram
  "mc_cid", // Mailchimp
  "mc_eid", // Mailchimp
]);

function isTrackingParam(key: string): boolean {
  return key.startsWith("utm_") || TRACKING_PARAMS.has(key);
}

// `si`（共有元を追跡するパラメータ）を共有リンクに付けるサイト。`si` は他サイトでは
// 別の意味を持ちうるので、これらのホストに限って削除する。YouTube・Spotify が対象。
function hostStripsSi(base: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(base).hostname;
  } catch {
    return false;
  }
  return (
    hostname === "youtu.be" ||
    hostname === "youtube.com" ||
    hostname.endsWith(".youtube.com") ||
    hostname === "spotify.com" ||
    hostname.endsWith(".spotify.com") ||
    hostname === "spotify.link"
  );
}

// query 文字列（先頭の `?` 抜き）から追跡パラメータを取り除く。`si` は他サイトでは
// 意味が違いうるので対象ホスト（YouTube・Spotify）のときだけ削除する。
// 残りはバイト単位でそのまま保つ。
function cleanQuery(rawQuery: string, siHost: boolean): string {
  return rawQuery
    .split("&")
    .filter((part) => {
      const key = part.split("=")[0];
      if (isTrackingParam(key)) return false;
      if (siHost && key === "si") return false;
      return true;
    })
    .join("&");
}

/**
 * 共有 URL を正規化する。query は基本そのまま残すが、コンテンツに無関係な既知の
 * 追跡パラメータ（`utm_*` や各種クリック ID、YouTube・Spotify の `si`）だけは削除する。
 * fragment はハッシュルーティング（`#/` 始まり）以外を削除する。`URL.toString()` での
 * 再構築は末尾スラッシュ付与や日本語パスの percent エンコードで保存文字列の表現を
 * 変えてしまうので、元の文字列から fragment（と空になった query）だけを切り取って
 * 残りをバイト単位で保つ。
 */
export function normalizeUrl(url: string): string {
  const hashIndex = url.indexOf("#");
  const fragment = hashIndex === -1 ? "" : url.slice(hashIndex);
  const withoutFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);

  const queryIndex = withoutFragment.indexOf("?");
  const base = queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? "" : withoutFragment.slice(queryIndex + 1);

  const cleanedQuery = cleanQuery(rawQuery, hostStripsSi(base));

  const keptQuery = cleanedQuery === "" ? "" : "?" + cleanedQuery;
  const keptFragment = fragment.startsWith("#/") ? fragment : "";

  return base + keptQuery + keptFragment;
}
