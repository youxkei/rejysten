import http from "http";
import net from "net";
import { spawn, type ChildProcess } from "child_process";
import type { TestProject } from "vitest/node";

const CONTAINER_PORT = 8080;
const POOL_SIZE = 2;

let server: http.Server | undefined;
let httpPort: number;

interface EmulatorInstance {
  port: number;
  containerName: string;
  process: ChildProcess;
}

const allEmulators: EmulatorInstance[] = [];
const availableEmulators: EmulatorInstance[] = [];
const waitQueue: Array<(instance: EmulatorInstance) => void> = [];

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

async function waitForEmulator(port: number, maxAttempts = 60): Promise<void> {
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

async function startEmulator(): Promise<EmulatorInstance> {
  const port = await findFreePort();
  const containerName = `firebase-emulator-test-${crypto.randomUUID()}`;

  console.log(`[globalSetup] Starting emulator on port ${port}, container: ${containerName}`);

  const emulatorProcess = spawn(
    "podman",
    [
      "run",
      "--rm",
      "--name",
      containerName,
      "-p",
      `${port}:${CONTAINER_PORT}`,
      "-v",
      `${process.cwd()}/firebase.local.json:/firebase/firebase.json`,
      "-v",
      `${process.cwd()}/firestore.local.rules:/firebase/firestore.rules`,
      "firebase-emulator",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  emulatorProcess.stderr?.on("data", (data) => {
    console.error(`[emulator:${port}] ${data.toString().trim()}`);
  });

  const instance: EmulatorInstance = { port, containerName, process: emulatorProcess };

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
  console.log(`[globalSetup] Stopping emulator on port ${instance.port}, container: ${instance.containerName}`);

  const rmProcess = spawn("podman", ["rm", "-f", instance.containerName], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve) => {
    rmProcess.on("close", () => resolve());
  });

  console.log(`[globalSetup] Emulator on port ${instance.port} stopped`);
}

function acquireFromPool(): Promise<EmulatorInstance> {
  const available = availableEmulators.shift();
  if (available) {
    return Promise.resolve(available);
  }
  return new Promise((resolve) => {
    waitQueue.push(resolve);
  });
}

async function releaseToPool(port: number): Promise<void> {
  // Clear database before returning to pool
  await fetch(`http://localhost:${port}/emulator/v1/projects/demo/databases/(default)/documents`, {
    method: "DELETE",
  });

  const instance = allEmulators.find((e) => e.port === port);
  if (!instance) return;

  const waiter = waitQueue.shift();
  if (waiter) {
    waiter(instance);
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
  // Skip if already set up
  if (httpPort) {
    console.log(`[globalSetup] Already set up, skipping (HTTP port: ${httpPort})`);
    project.provide("httpPort", httpPort);
    return;
  }

  // 1. Find free port for HTTP server
  httpPort = await findFreePort();

  console.log(`[globalSetup] Using HTTP port: ${httpPort}`);

  // 2. Provide HTTP port to tests
  project.provide("httpPort", httpPort);

  // 3. Start emulator pool (sequentially to avoid resource contention)
  for (let i = 0; i < POOL_SIZE; i++) {
    const instance = await startEmulator();
    allEmulators.push(instance);
    availableEmulators.push(instance);
  }
  console.log(`[globalSetup] Emulator pool ready (${POOL_SIZE} instances)`);

  // 4. Start HTTP server
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
      const instance = await acquireFromPool();
      res.writeHead(200);
      res.end(JSON.stringify({ emulatorPort: instance.port }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/emulator/release") {
      const body = await readRequestBody(req);
      const { port } = JSON.parse(body);
      await releaseToPool(port);
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
          available: availableEmulators.length,
          waiting: waitQueue.length,
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(httpPort);
  console.log(`[globalSetup] HTTP server listening on port ${httpPort}`);

  // Add signal handlers for cleanup on Ctrl+C or termination
  const cleanup = async () => {
    console.log(`[globalSetup] Received shutdown signal, cleaning up...`);
    await teardown();
    process.exit(0);
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  // Return teardown function (Vitest recommended pattern)
  return async () => {
    console.log(`[globalSetup] Teardown called via return function`);
    await teardown();
  };
}

export async function teardown() {
  console.log(`[globalSetup] Shutting down...`);

  // Unblock any waiters
  for (const waiter of waitQueue) {
    // These will get a dead emulator, but teardown is happening anyway
    waiter(allEmulators[0]);
  }
  waitQueue.length = 0;

  if (server) {
    server.close();
  }

  for (const instance of allEmulators) {
    await stopEmulator(instance);
  }
  allEmulators.length = 0;
  availableEmulators.length = 0;

  console.log(`[globalSetup] Shutdown complete`);
}
