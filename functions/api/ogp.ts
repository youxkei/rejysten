interface Env {}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ success: false, reason: "Invalid JSON body" });
  }

  const targetUrl =
    typeof body === "object" && body !== null && "url" in body && typeof body.url === "string" ? body.url : null;
  if (!targetUrl) return Response.json({ success: false, reason: "Missing url" });

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return Response.json({ success: false, reason: "Invalid URL" });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return Response.json({ success: false, reason: "Only http/https URLs are supported" });
  }

  try {
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        // Send a self-consistent Chrome navigation fingerprint. A Chrome User-Agent
        // without client hints (sec-ch-ua) and sec-fetch-* headers looks inconsistent and
        // gets blocked with 403 by bot defenses such as Akamai. Keep the sec-ch-ua v= in
        // sync with the User-Agent's Chrome version (bump both together on updates).
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return Response.json({ success: false, reason: `HTTP ${response.status}` });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return Response.json({
        success: true,
        result: { title: null, description: null, ogp: {} },
      });
    }

    let ogTitle: string | null = null;
    let ogDescription: string | null = null;
    let htmlTitle: string | null = null;
    let metaDescription: string | null = null;

    const rewriter = new HTMLRewriter()
      .on('meta[property="og:title"]', {
        element(el) {
          const content = el.getAttribute("content");
          if (content) ogTitle = content;
        },
      })
      .on('meta[property="og:description"]', {
        element(el) {
          const content = el.getAttribute("content");
          if (content) ogDescription = content;
        },
      })
      .on('meta[name="description"]', {
        element(el) {
          const content = el.getAttribute("content");
          if (content) metaDescription = content;
        },
      })
      .on("title", {
        text(text) {
          htmlTitle = (htmlTitle ?? "") + text.text;
        },
      });

    const transformed = rewriter.transform(response);
    await transformed.text();

    const ogp: Record<string, string[]> = {};
    if (ogTitle) ogp["og:title"] = [ogTitle];
    if (ogDescription) ogp["og:description"] = [ogDescription];

    return Response.json({
      success: true,
      result: {
        title: htmlTitle?.trim() || null,
        description: metaDescription ?? null,
        ogp,
      },
    });
  } catch {
    return Response.json({ success: false, reason: "fetch failed" });
  }
};
