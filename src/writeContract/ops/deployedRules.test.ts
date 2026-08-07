import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Relative, and read as text: the deployed rules live at the repository root,
// which the @/ alias does not reach, and they are data rather than a module.
import deployedRules from "../../../firestore.rules?raw";
import { acquireEmulator, releaseEmulator } from "@/test";
import { buildOpDeps } from "@/writeContract/ops/http";
import { type OpDeps } from "@/writeContract/ops/shared";
import { startLifeLog } from "@/writeContract/ops/start";
import { stopLifeLog } from "@/writeContract/ops/stop";
import { listSwitchCandidates } from "@/writeContract/ops/switchCandidates";

// The uid firestore.rules gates on. Everything else is denied, so a token for any
// other user proves the rules are being enforced at all.
const ALLOWED_UID = "XoVR64j2pfgnlX8L05kL5V96y8n1";

let emulatorPort: number;

// The emulator accepts an unsigned JWT as an ID token, which is the only way to
// exercise the rules from the REST path: the suite's usual "Bearer owner" is an
// emulator escape hatch that skips them entirely, so it can say nothing about
// whether the deployed rules permit these writes.
function idToken(projectId: string, uid: string): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    sub: uid,
    user_id: uid,
    auth_time: issuedAt,
    iat: issuedAt,
    exp: issuedAt + 3600,
    firebase: { identities: {}, sign_in_provider: "custom" },
  };
  return `${encode(header)}.${encode(payload)}.`;
}

// The shared emulator boots with firestore.local.rules (open, auth-free), so the
// deployed rules have to be pushed in for the project this test uses.
async function loadDeployedRules(projectId: string): Promise<void> {
  const res = await fetch(`http://localhost:${emulatorPort}/emulator/v1/projects/${projectId}:securityRules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: deployedRules }] } }),
  });
  if (!res.ok) throw new Error(`loading rules failed (${res.status}): ${await res.text()}`);
}

function deps(projectId: string, uid: string = ALLOWED_UID): OpDeps {
  return buildOpDeps({
    projectId,
    emulatorHost: `localhost:${emulatorPort}`,
    authHeader: `Bearer ${idToken(projectId, uid)}`,
    fetch: globalThis.fetch,
  });
}

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

describe("the endpoints under the deployed firestore.rules", () => {
  it("lists switch candidates for the gated uid", async () => {
    const project = "deployed-rules-read";
    await loadDeployedRules(project);

    await expect(listSwitchCandidates(deps(project))).resolves.toEqual({ ok: true, candidates: [] });
  });

  it("starts an entry for the gated uid", async () => {
    const project = "deployed-rules-start";
    await loadDeployedRules(project);

    const result = await startLifeLog(deps(project));

    expect(result.ok).toBe(true);
  });

  it("stops the entry it started", async () => {
    const project = "deployed-rules-stop";
    await loadDeployedRules(project);
    const started = await startLifeLog(deps(project));

    const stopped = await stopLifeLog(deps(project));

    expect(stopped).toEqual({ ok: true, id: started.id });
  });

  it("denies a token for any other uid, so the rules above were really enforced", async () => {
    const project = "deployed-rules-wrong-uid";
    await loadDeployedRules(project);

    await expect(startLifeLog(deps(project, "someoneElse"))).rejects.toThrow();
  });
});
