import { type Span, withSpan } from "@/telemetry/span";

type OGPScannerResponse =
  | {
      success: true;
      result: {
        title: string | null;
        description: string | null;
        ogp: Record<string, string[] | undefined>;
      };
    }
  | { success: false; reason: string; colo?: string | null };

type ResolveUrlResponse = { success: true; url: string } | { success: false; reason: string };

async function callOGPEndpoint(
  endpoint: string,
  url: string,
  parent: Span,
  attempt = 1,
): Promise<OGPScannerResponse | null> {
  return withSpan(
    "ogp.fetch",
    async (span) => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          span.setAttribute("app.success", false);
          span.setAttribute("app.reason", `HTTP ${res.status}`);
          return null;
        }
        const data = (await res.json()) as OGPScannerResponse;
        span.setAttribute("app.success", data.success);
        if (!data.success) {
          span.setAttribute("app.reason", data.reason);
          if (data.colo) span.setAttribute("app.colo", data.colo);
        }
        return data;
      } catch (error) {
        span.setAttribute("app.success", false);
        span.setAttribute("app.reason", error instanceof Error ? error.message : String(error));
        return null;
      }
    },
    { parent, attributes: { "app.endpoint": endpoint, "app.attempt": attempt } },
  );
}

export async function resolveUrl(url: string): Promise<string | null> {
  return withSpan("ogp.resolveUrl", async (span) => {
    try {
      const res = await fetch("/api/resolve-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        span.setAttribute("app.success", false);
        return null;
      }

      const data = (await res.json()) as ResolveUrlResponse;
      span.setAttribute("app.success", data.success);
      return data.success ? data.url : null;
    } catch {
      span.setAttribute("app.success", false);
      return null;
    }
  });
}

function parseOGP(data: OGPScannerResponse): { title: string | null; description: string | null } {
  if (!data.success) return { title: null, description: null };
  return {
    title: data.result.ogp["og:title"]?.[0] ?? data.result.title ?? null,
    description: data.result.ogp["og:description"]?.[0] ?? data.result.description ?? null,
  };
}

const fallbackAttempts = 3;

export async function fetchOGPMeta(url: string): Promise<{ title: string | null; description: string | null }> {
  return withSpan("ogp.fetchMeta", async (span) => {
    const scannerResult = await callOGPEndpoint("https://ogp-scanner.kunon.jp/v2/ogp_info", url, span);
    if (scannerResult?.success) return parseOGP(scannerResult);

    // Bot defenses such as Akamai refuse a share of requests from the function at random with a
    // quick 403, and a fresh request can leave Cloudflare from a different egress address. Other
    // failures are not retried: a timeout would multiply the wait before the share is recorded.
    for (let attempt = 1; attempt <= fallbackAttempts; attempt++) {
      const fallbackResult = await callOGPEndpoint("/api/ogp", url, span, attempt);
      if (fallbackResult?.success) return parseOGP(fallbackResult);
      if (fallbackResult?.reason !== "HTTP 403") break;
    }

    return { title: null, description: null };
  });
}
