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

async function callOGPEndpoint(endpoint: string, url: string): Promise<OGPScannerResponse | null> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as OGPScannerResponse;
  } catch {
    return null;
  }
}

function parseOGP(data: OGPScannerResponse): { title: string | null; description: string | null } {
  if (!data.success) return { title: null, description: null };
  return {
    title: data.result.ogp["og:title"]?.[0] ?? data.result.title ?? null,
    description: data.result.ogp["og:description"]?.[0] ?? data.result.description ?? null,
  };
}

export async function fetchOGPMeta(url: string): Promise<{ title: string | null; description: string | null }> {
  const scannerResult = await callOGPEndpoint("https://ogp-scanner.kunon.jp/v2/ogp_info", url);
  if (scannerResult?.success) return parseOGP(scannerResult);

  const fallbackResult = await callOGPEndpoint("/api/ogp", url);
  if (fallbackResult?.success) return parseOGP(fallbackResult);

  return { title: null, description: null };
}
