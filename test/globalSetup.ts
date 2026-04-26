import http from "http";
import net from "net";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { spawn, type ChildProcess } from "child_process";
import type { TestProject } from "vitest/node";

const POOL_SIZE = 2;

let server: http.Server | undefined;
let httpPort: number | undefined;
let cleanupHandlersInstalled = false;
let shutdownStarted = false;

interface EmulatorInstance {
  port: number;
  tmpDir: string;
  process: ChildProcess;
}

interface EmulatorLease {
  instance: EmulatorInstance;
  leaseId: string;
}

const allEmulators: EmulatorInstance[] = [];
const availableEmulators: EmulatorInstance[] = [];
const acquiredEmulators = new Map<number, string>();
const waitQueue: Array<(lease: EmulatorLease) => void> = [];

declare module "vitest" {
  export interface ProvidedContext {
    httpPort: number;
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForEmulator(port: number, maxAttempts = 120): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok || res.status === 404) {
        return;
      }
    } catch {
      // Emulator not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Emulator did not start within ${maxAttempts} seconds`);
}

const firebaseBin = fileURLToPath(new URL("../node_modules/.bin/firebase", import.meta.url));

function removeFromArray<T>(array: T[], item: T): void {
  const index = array.indexOf(item);
  if (index !== -1) array.splice(index, 1);
}

function createLease(instance: EmulatorInstance): EmulatorLease {
  const leaseId = randomUUID();
  acquiredEmulators.set(instance.port, leaseId);
  return { instance, leaseId };
}

function killEmulatorProcess(instance: EmulatorInstance, signal: NodeJS.Signals): void {
  const pid = instance.process.pid;
  if (pid === undefined || instance.process.exitCode !== null) return;

  try {
    process.kill(-pid, signal);
  } catch {
    try {
      instance.process.kill(signal);
    } catch {
      // Process already gone
    }
  }
}

function killAllEmulatorProcessesSync(signal: NodeJS.Signals): void {
  for (const instance of allEmulators) {
    killEmulatorProcess(instance, signal);
  }
}

function cleanupAllEmulatorsSync(signal: NodeJS.Signals): void {
  killAllEmulatorProcessesSync(signal);

  for (const instance of allEmulators) {
    try {
      fs.rmSync(instance.tmpDir, { recursive: true, force: true });
    } catch {
      // The process is exiting, so best-effort cleanup is enough here.
    }
  }
}

function installCleanupHandlers(): void {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  const cleanupForSignal = (signal: NodeJS.Signals) => {
    if (shutdownStarted) return;
    shutdownStarted = true;

    void (async () => {
      console.log(`[globalSetup] Received ${signal}, cleaning up...`);
      try {
        await teardown();
      } catch (e) {
        console.error(`[globalSetup] Cleanup after ${signal} failed`, e);
        killAllEmulatorProcessesSync("SIGKILL");
      } finally {
        process.exit(signal === "SIGINT" ? 130 : 143);
      }
    })();
  };

  process.once("SIGINT", cleanupForSignal);
  process.once("SIGTERM", cleanupForSignal);
  process.once("SIGHUP", cleanupForSignal);

  process.once("exit", () => {
    cleanupAllEmulatorsSync("SIGTERM");
  });
}

async function startEmulator(): Promise<EmulatorInstance> {
  const port = await findFreePort();
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "firebase-emu-"));
  const rulesPath = path.resolve(process.cwd(), "firestore.local.rules");
  const configPath = path.join(tmpDir, "firebase.json");
  await fs.promises.writeFile(
    configPath,
    JSON.stringify({
      firestore: { rules: rulesPath },
      emulators: { firestore: { host: "127.0.0.1", port } },
    }),
  );

  console.log(`[globalSetup] Starting emulator on port ${port}, tmpDir: ${tmpDir}`);

  const emulatorProcess = spawn(
    firebaseBin,
    ["emulators:start", "--only", "firestore", "--config", configPath, "--project", "demo"],
    {
      cwd: tmpDir,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: { ...process.env, JAVA_TOOL_OPTIONS: "-XX:+UseZGC" },
    },
  );

  emulatorProcess.stderr?.on("data", (data) => {
    console.error(`[emulator:${port}] ${data.toString().trim()}`);
  });

  const instance: EmulatorInstance = { port, tmpDir, process: emulatorProcess };
  allEmulators.push(instance);

  console.log(`[globalSetup] Waiting for emulator on port ${port} to be ready...`);
  try {
    await waitForEmulator(port);
    console.log(`[globalSetup] Emulator on port ${port} is ready`);
  } catch (e) {
    console.error(`[globalSetup] Emulator on port ${port} failed to start, cleaning up...`);
    await stopEmulator(instance);
    throw e;
  }

  return instance;
}

async function stopEmulator(instance: EmulatorInstance): Promise<void> {
  console.log(`[globalSetup] Stopping emulator on port ${instance.port}, tmpDir: ${instance.tmpDir}`);

  if (instance.process.pid !== undefined && instance.process.exitCode === null) {
    killEmulatorProcess(instance, "SIGTERM");

    await Promise.race([
      new Promise<void>((resolve) => {
        if (instance.process.exitCode !== null) {
          resolve();
          return;
        }
        instance.process.once("exit", () => resolve());
      }),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          killEmulatorProcess(instance, "SIGKILL");
          resolve();
        }, 3000),
      ),
    ]);
  }

  await fs.promises.rm(instance.tmpDir, { recursive: true, force: true });
  removeFromArray(allEmulators, instance);
  removeFromArray(availableEmulators, instance);

  console.log(`[globalSetup] Emulator on port ${instance.port} stopped`);
}

function acquireFromPool(): Promise<EmulatorLease> {
  const available = availableEmulators.shift();
  if (available) {
    return Promise.resolve(createLease(available));
  }
  return new Promise((resolve) => {
    waitQueue.push((lease) => {
      resolve(lease);
    });
  });
}

async function releaseToPool(port: number, leaseId: string | undefined): Promise<void> {
  if (leaseId === undefined || acquiredEmulators.get(port) !== leaseId) return;
  const instance = allEmulators.find((e) => e.port === port);
  if (!instance) return;

  // Clear database before returning to pool
  await fetch(`http://localhost:${port}/emulator/v1/projects/demo/databases/(default)/documents`, {
    method: "DELETE",
  });
  if (acquiredEmulators.get(port) !== leaseId) return;
  acquiredEmulators.delete(port);

  const waiter = waitQueue.shift();
  if (waiter) {
    waiter(createLease(instance));
  } else {
    availableEmulators.push(instance);
  }
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
  });
}

export async function setup(project: TestProject) {
  installCleanupHandlers();

  // Skip if already set up
  if (httpPort) {
    console.log(`[globalSetup] Already set up, skipping (HTTP port: ${httpPort})`);
    project.provide("httpPort", httpPort);
    return;
  }

  // 1. Start HTTP server first and let the OS reserve its port. This avoids a
  // race where a port found as "free" for HTTP is later picked by an emulator
  // before the HTTP server has actually bound it.
  server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${httpPort}`);

    if (req.method === "POST" && url.pathname === "/emulator/acquire") {
      const { instance, leaseId } = await acquireFromPool();
      res.writeHead(200);
      res.end(JSON.stringify({ emulatorPort: instance.port, leaseId }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/emulator/release") {
      const body = await readRequestBody(req);
      const { port, leaseId } = JSON.parse(body);
      await releaseToPool(port, leaseId);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          status: "ok",
          total: allEmulators.length,
          emulatorPorts: allEmulators.map((instance) => instance.port),
          available: availableEmulators.length,
          availablePorts: availableEmulators.map((instance) => instance.port),
          acquiredPorts: Array.from(acquiredEmulators.keys()),
          waiting: waitQueue.length,
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    const currentServer = server;
    if (!currentServer) {
      reject(new Error("HTTP server was not created"));
      return;
    }

    const onError = (error: Error) => {
      currentServer.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      currentServer.off("error", onError);
      const address = currentServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("HTTP server did not expose a TCP port"));
        return;
      }
      httpPort = address.port;
      resolve();
    };

    currentServer.once("error", onError);
    currentServer.once("listening", onListening);
    currentServer.listen(0);
  });

  const providedHttpPort = httpPort;
  if (providedHttpPort === undefined) {
    throw new Error("HTTP server port was not assigned");
  }

  console.log(`[globalSetup] Using HTTP port: ${providedHttpPort}`);
  console.log(`[globalSetup] HTTP server listening on port ${providedHttpPort}`);

  // 2. Provide HTTP port to tests
  project.provide("httpPort", providedHttpPort);

  // 3. Start emulator pool (sequentially to avoid resource contention)
  for (let i = 0; i < POOL_SIZE; i++) {
    const instance = await startEmulator();
    availableEmulators.push(instance);
  }
  console.log(`[globalSetup] Emulator pool ready (${POOL_SIZE} instances)`);

  // Return teardown function (Vitest recommended pattern)
  return async () => {
    console.log(`[globalSetup] Teardown called via return function`);
    await teardown();
  };
}

export async function teardown() {
  if (shutdownStarted) {
    killAllEmulatorProcessesSync("SIGTERM");
  } else {
    shutdownStarted = true;
  }

  console.log(`[globalSetup] Shutting down...`);

  // Unblock any waiters
  const fallbackInstance = allEmulators[0];
  if (fallbackInstance) {
    for (const waiter of waitQueue) {
      // These will get a dead emulator, but teardown is happening anyway.
      waiter({ instance: fallbackInstance, leaseId: "" });
    }
  }
  waitQueue.length = 0;

  if (server) {
    server.close();
    server = undefined;
  }

  for (const instance of [...allEmulators]) {
    await stopEmulator(instance);
  }
  allEmulators.length = 0;
  availableEmulators.length = 0;
  acquiredEmulators.clear();
  httpPort = undefined;
  shutdownStarted = false;

  console.log(`[globalSetup] Shutdown complete`);
}
