/* eslint-disable no-relative-import-paths/no-relative-import-paths */
import { buildOpDeps, httpErrorFor } from "../../../src/writeContract/ops/http";
import { switchLifeLog } from "../../../src/writeContract/ops/switch";

interface Env {
  FIRESTORE_PROJECT_ID: string;
  FIRESTORE_EMULATOR_HOST?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authHeader = context.request.headers.get("Authorization");
  if (!authHeader) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, reason: "bad request" }, { status: 400 });
  }
  const sourceId =
    typeof body === "object" && body !== null && "sourceId" in body && typeof body.sourceId === "string"
      ? body.sourceId
      : null;
  if (!sourceId) return Response.json({ ok: false, reason: "bad request" }, { status: 400 });

  const deps = buildOpDeps({
    projectId: context.env.FIRESTORE_PROJECT_ID,
    emulatorHost: context.env.FIRESTORE_EMULATOR_HOST,
    authHeader,
    fetch: globalThis.fetch,
  });

  try {
    const result = await switchLifeLog(deps, { sourceId });
    return Response.json(result, { status: result.ok ? 200 : 404 });
  } catch (error) {
    const { status, reason } = httpErrorFor(error);
    return Response.json({ ok: false, reason }, { status });
  }
};
