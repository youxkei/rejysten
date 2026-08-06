import { describe, expect, it, vi } from "vitest";

import { buildBaseUrl, buildOpDeps, httpErrorFor } from "@/writeContract/ops/http";
import { RestContentionError, RestRequestError, RestUnauthorizedError } from "@/writeContract/rest/errors";

describe("buildOpDeps", () => {
  it("hands over a fetch that still works when called as a property of the deps", async () => {
    // The transport calls `config.fetch(...)`, and the Workers runtime rejects its
    // fetch when `this` is anything but the global scope. Node's fetch accepts it,
    // so this stand-in enforces the constraint the deployed runtime imposes.
    const globalScopeOnly = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation: function called with incorrect `this` reference.");
      }
      return Promise.resolve(new Response("[]"));
    });

    const deps = buildOpDeps({
      projectId: "demo",
      authHeader: "Bearer token",
      fetch: globalScopeOnly,
    });

    await expect(deps.fetch("https://example.test")).resolves.toBeInstanceOf(Response);

    // Proof that the stand-in above discriminates: the same function reached
    // through an object that is not the global scope is what production did.
    const unbound = { fetch: globalScopeOnly };
    expect(() => unbound.fetch()).toThrow(TypeError);
  });

  it("carries the auth header through untouched so Firestore evaluates the caller's rules", () => {
    const deps = buildOpDeps({ projectId: "demo", authHeader: "Bearer token", fetch: globalThis.fetch });

    expect(deps.authHeader).toBe("Bearer token");
    expect(deps.projectId).toBe("demo");
  });
});

describe("buildBaseUrl", () => {
  it("addresses the hosted Firestore for a project", () => {
    expect(buildBaseUrl("rejysten3-dev", undefined)).toBe(
      "https://firestore.googleapis.com/v1/projects/rejysten3-dev/databases/(default)/documents",
    );
  });

  it("addresses the emulator over plain http when one is configured", () => {
    expect(buildBaseUrl("demo", "localhost:8080")).toBe(
      "http://localhost:8080/v1/projects/demo/databases/(default)/documents",
    );
  });
});

describe("httpErrorFor", () => {
  it("propagates an expired token as 401 so the watch refreshes and retries", () => {
    expect(httpErrorFor(new RestUnauthorizedError("detail"))).toEqual({ status: 401, reason: "unauthorized" });
  });

  it("reports exhausted transaction retries as 503", () => {
    expect(httpErrorFor(new RestContentionError(5))).toEqual({ status: 503, reason: "contention" });
  });

  it("reports any other transport failure as 500", () => {
    expect(httpErrorFor(new RestRequestError(400, "bad request"))).toEqual({
      status: 500,
      reason: "internal error",
    });
    expect(httpErrorFor(new Error("boom"))).toEqual({ status: 500, reason: "internal error" });
  });
});
