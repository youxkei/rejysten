import { type OpDeps } from "./shared";
import { RestContentionError, RestUnauthorizedError } from "../rest/errors";

// Framework-agnostic glue shared by the Cloudflare Pages handlers (bundled
// `@/`-free via relative import). Keeps the handlers to auth/body/status only.

export function buildBaseUrl(projectId: string, emulatorHost: string | undefined): string {
  const origin = emulatorHost ? `http://${emulatorHost}` : "https://firestore.googleapis.com";
  return `${origin}/v1/projects/${projectId}/databases/(default)/documents`;
}

export function buildOpDeps(args: {
  projectId: string;
  emulatorHost?: string;
  authHeader: string;
  fetch: typeof fetch;
  now?: () => number;
}): OpDeps {
  return {
    fetch: args.fetch,
    baseUrl: buildBaseUrl(args.projectId, args.emulatorHost),
    projectId: args.projectId,
    authHeader: args.authHeader,
    now: args.now ?? (() => Date.now()),
  };
}

// Maps a thrown transport error to an HTTP status. Business outcomes (no open
// entry, source not found) are carried in op results, not thrown, so they are
// mapped by the handlers themselves.
export function httpErrorFor(error: unknown): { status: number; reason: string } {
  if (error instanceof RestUnauthorizedError) return { status: 401, reason: "unauthorized" };
  if (error instanceof RestContentionError) return { status: 503, reason: "contention" };
  return { status: 500, reason: "internal error" };
}
