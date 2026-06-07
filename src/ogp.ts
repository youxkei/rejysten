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
  | { success: false; reason: string };

type ResolveUrlResponse = { success: true; url: string } | { success: false; reason: string };

async function callOGPEndpoint(endpoint: string, url: string, parent: Span): Promise<OGPScannerResponse | null> {
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
          return null;
        }
        const data = (await res.json()) as OGPScannerResponse;
        span.setAttribute("app.success", data.success);
        return data;
      } catch {
        span.setAttribute("app.success", false);
        return null;
      }
    },
    { parent, attributes: { "app.endpoint": endpoint } },
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

export async function fetchOGPMeta(url: string): Promise<{ title: string | null; description: string | null }> {
  return withSpan("ogp.fetchMeta", async (span) => {
    const scannerResult = await callOGPEndpoint("https://ogp-scanner.kunon.jp/v2/ogp_info", url, span);
    if (scannerResult?.success) return parseOGP(scannerResult);

    const fallbackResult = await callOGPEndpoint("/api/ogp", url, span);
    if (fallbackResult?.success) return parseOGP(fallbackResult);

    return { title: null, description: null };
  });
}
