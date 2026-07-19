/* eslint-disable no-relative-import-paths/no-relative-import-paths */
import { buildOpDeps, httpErrorFor } from "../../../src/writeContract/ops/http";
import { listSwitchCandidates } from "../../../src/writeContract/ops/switchCandidates";

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

  try {
    const result = await listSwitchCandidates(deps);
    return Response.json(result);
  } catch (error) {
    const { status, reason } = httpErrorFor(error);
    return Response.json({ ok: false, reason }, { status });
  }
};
