const { onRequest } = require("firebase-functions/v2/https");

exports.ogp = onRequest({ region: "asia-northeast1", invoker: "public" }, async (req, res) => {
  const url = req.query.url;
  if (!url) return res.json({ error: "missing url" });

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return res.json({ title: null });
    }

    const text = await response.text();
    const ogMatch = text.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
    const titleMatch = text.match(/<title>([^<]+)<\/title>/);

    const title = ogMatch ? ogMatch[1] : titleMatch ? titleMatch[1].trim() : null;
    res.json({ title });
  } catch {
    res.json({ title: null });
  }
});
