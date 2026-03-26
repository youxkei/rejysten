interface Env {}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const requestUrl = new URL(context.request.url);
  const targetUrl = requestUrl.searchParams.get("url");

  if (!targetUrl) {
    return Response.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return Response.json({ error: "Only http/https URLs are supported" }, { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return Response.json({ title: null });
    }

    let ogTitle: string | null = null;
    let htmlTitle: string | null = null;

    const rewriter = new HTMLRewriter()
      .on('meta[property="og:title"]', {
        element(el) {
          const content = el.getAttribute("content");
          if (content) ogTitle = content;
        },
      })
      .on("title", {
        text(text) {
          htmlTitle = (htmlTitle ?? "") + text.text;
        },
      });

    const transformed = rewriter.transform(response);
    await transformed.text();

    const title = ogTitle ?? (htmlTitle?.trim() || null);
    return Response.json({ title });
  } catch {
    return Response.json({ title: null });
  }
};
