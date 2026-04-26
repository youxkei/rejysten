import { test, inject } from "vitest";

declare global {
  // eslint-disable-next-line no-var
  var __testEmulatorPort__: number | undefined;
  // eslint-disable-next-line no-var
  var __testEmulatorLeases__: Map<number, string> | undefined;
}

const shortener = /^styles_styles_(.+)__\w{8}$/;

export function shortenClassName(root: HTMLElement) {
  for (const element of Array.from(root.querySelectorAll("[class]"))) {
    for (const className of Array.from(element.classList)) {
      const match = className.match(shortener);
      if (match) {
        element.classList.replace(className, match[1]);
      }
    }
  }

  return root;
}

export function getPromiseWithResolve<T = void>() {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let resolve = (_: T) => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

export function randomPosInt() {
  return Math.floor(Math.random() * 1024) + 1;
}

function getTestServerUrl(): string {
  const httpPort = inject("httpPort");
  return `http://localhost:${httpPort}`;
}

export async function acquireEmulator(): Promise<number> {
  const res = await fetch(`${getTestServerUrl()}/emulator/acquire`, {
    method: "POST",
  });
  const { emulatorPort, leaseId } = await res.json();
  globalThis.__testEmulatorLeases__ ??= new Map();
  globalThis.__testEmulatorLeases__.set(emulatorPort, leaseId);
  globalThis.__testEmulatorPort__ = emulatorPort;
  return emulatorPort;
}

export async function releaseEmulator(emulatorPort?: number): Promise<void> {
  const port = emulatorPort ?? globalThis.__testEmulatorPort__;
  if (port === undefined) return;

  const leaseId = globalThis.__testEmulatorLeases__?.get(port);
  await fetch(`${getTestServerUrl()}/emulator/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ port, leaseId }),
  });
  globalThis.__testEmulatorLeases__?.delete(port);
  if (globalThis.__testEmulatorPort__ === port) {
    globalThis.__testEmulatorPort__ = undefined;
  }
}

export type DatabaseInfo = {
  emulatorPort: number;
};

export async function getEmulatorPort(): Promise<number> {
  const port = globalThis.__testEmulatorPort__;
  if (port === undefined) {
    throw new Error("Emulator port not available. Call acquireEmulator() first.");
  }
  return port;
}

async function clearDatabase(emulatorPort: number): Promise<void> {
  await fetch(`http://localhost:${emulatorPort}/emulator/v1/projects/demo/databases/(default)/documents`, {
    method: "DELETE",
  });
}

export function createTestWithDb(getEmulatorPort: () => number) {
  return test.extend<{ db: DatabaseInfo }>({
    db: async ({}, use) => {
      const emulatorPort = getEmulatorPort();
      await use({ emulatorPort });
      await clearDatabase(emulatorPort);
    },
  });
}

export const testWithDb = test.extend<{ db: DatabaseInfo }>({
  db: async ({}, use) => {
    const emulatorPort = await getEmulatorPort();
    await use({ emulatorPort });
    await clearDatabase(emulatorPort);
  },
});
