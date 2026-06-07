import { describe, expect, it } from "vitest";

import { markTelemetryReady, telemetryReady } from "@/telemetry/ready";

describe("telemetry ready", () => {
  it("keeps telemetryReady pending until markTelemetryReady is called", async () => {
    let resolved = false;
    void telemetryReady.then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolved).toBe(false);

    markTelemetryReady();
    await telemetryReady;
    expect(resolved).toBe(true);
  });
});
