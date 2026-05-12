type Env = Record<string, never>;

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
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      },
      redirect: "manual",
    });

    const location = response.headers.get("Location");
    if (location) {
      return Response.json({ success: true, url: new URL(location, targetUrl).href });
    }

    return Response.json({ success: true, url: response.url || targetUrl });
  } catch {
    return Response.json({ success: false, reason: "fetch failed" });
  }
};
