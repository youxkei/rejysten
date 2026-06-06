type Env = {
  OTLP_ENDPOINT?: string;
  OTLP_HEADERS?: string;
};

// Single-user telemetry batches are tiny; anything bigger is dropped silently.
const maxBodyBytes = 512 * 1024;

function parseHeaders(json: string): Record<string, string> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") return undefined;
    headers[key] = value;
  }
  return headers;
}

// Forwards OTLP/HTTP JSON payloads from the browser to the trace backend,
// attaching the API key server-side so it never reaches the client. The
// payload is streamed through without being parsed.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Unconfigured (local dev, preview deployments): drop quietly so the
  // client-side exporter treats the batch as delivered.
  if (!env.OTLP_ENDPOINT) return new Response(null, { status: 204 });

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > maxBodyBytes) return new Response(null, { status: 204 });

  let extraHeaders: Record<string, string> = {};
  if (env.OTLP_HEADERS) {
    const parsed = parseHeaders(env.OTLP_HEADERS);
    if (!parsed) return new Response(null, { status: 204 });
    extraHeaders = parsed;
  }

  try {
    const upstream = await fetch(env.OTLP_ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": request.headers.get("Content-Type") ?? "application/json",
        ...extraHeaders,
      },
      body: request.body,
    });

    // The exporter only distinguishes success from failure; hide upstream details.
    return new Response(null, { status: upstream.ok ? 200 : 502 });
  } catch {
    return new Response(null, { status: 502 });
  }
};
