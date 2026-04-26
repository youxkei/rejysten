import { inject, describe, expect, it } from "vitest";

import { acquireEmulator, releaseEmulator } from "@/test";

function testServerUrl(): string {
  return `http://localhost:${inject("httpPort")}`;
}

type HealthResponse = {
  status: string;
  emulatorPorts: number[];
  availablePorts: number[];
  acquiredPorts: number[];
};

describe("test emulator pool", () => {
  it("does not enqueue the same emulator twice after duplicate release", { timeout: 120000 }, async () => {
    const first = await acquireEmulator();
    await releaseEmulator(first);
    await releaseEmulator(first);

    const health = await fetch(`${testServerUrl()}/health`).then((res) => res.json() as Promise<HealthResponse>);

    expect(new Set(health.availablePorts).size).toBe(health.availablePorts.length);
    expect(new Set(health.acquiredPorts).size).toBe(health.acquiredPorts.length);
    expect(health.availablePorts.every((port) => !health.acquiredPorts.includes(port))).toBe(true);
  });

  it("reports distinct HTTP and emulator ports after setup", async () => {
    const health = await fetch(`${testServerUrl()}/health`).then((res) => res.json() as Promise<HealthResponse>);
    expect(health.status).toBe("ok");
    expect(health.emulatorPorts).not.toContain(inject("httpPort"));
  });
});
