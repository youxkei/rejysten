/* eslint-disable no-relative-import-paths/no-relative-import-paths */
import { readCurrentLifeLog } from "../../../src/writeContract/ops/current";
import { buildOpDeps, httpErrorFor, logRequest } from "../../../src/writeContract/ops/http";

interface Env {
  FIRESTORE_PROJECT_ID: string;
  FIRESTORE_EMULATOR_HOST?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authHeader = context.request.headers.get("Authorization");
  if (!authHeader) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const deps = buildOpDeps({
    projectId: context.env.FIRESTORE_PROJECT_ID,
    emulatorHost: context.env.FIRESTORE_EMULATOR_HOST,
    authHeader,
    fetch: globalThis.fetch,
  });

  logRequest("current", context.env.FIRESTORE_PROJECT_ID);
  try {
    const result = await readCurrentLifeLog(deps);
    return Response.json(result);
  } catch (error) {
    const { status, reason } = httpErrorFor(error);
    return Response.json({ ok: false, reason }, { status });
  }
};
