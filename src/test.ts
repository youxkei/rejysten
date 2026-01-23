import { test, inject } from "vitest";

declare global {
  // eslint-disable-next-line no-var
  var __testEmulatorPort__: number | undefined;
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

export async function acquireEmulator(): Promise<void> {
  const res = await fetch(`${getTestServerUrl()}/emulator/acquire`, {
    method: "POST",
  });
  const { emulatorPort } = await res.json();
  globalThis.__testEmulatorPort__ = emulatorPort;
}

export async function releaseEmulator(): Promise<void> {
  const port = globalThis.__testEmulatorPort__;
  if (port === undefined) return;

  await fetch(`${getTestServerUrl()}/emulator/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ port }),
  });
  globalThis.__testEmulatorPort__ = undefined;
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

async function clearDatabase(database: string = "(default)"): Promise<void> {
  const emulatorPort = await getEmulatorPort();
  await fetch(`http://localhost:${emulatorPort}/emulator/v1/projects/demo/databases/${database}/documents`, {
    method: "DELETE",
  });
}

export const testWithDb = test.extend<{ db: DatabaseInfo }>({
  db: async ({}, use) => {
    const emulatorPort = await getEmulatorPort();
    await use({ emulatorPort });
    await clearDatabase();
  },
});
