import http from "http";
import net from "net";
import { spawn, type ChildProcess } from "child_process";
import type { TestProject } from "vitest/node";

const CONTAINER_PORT = 8080;

let server: http.Server | undefined;
let httpPort: number;

interface EmulatorInstance {
  port: number;
  containerName: string;
  process: ChildProcess;
}

const activeEmulators = new Map<number, EmulatorInstance>();

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

async function waitForEmulator(port: number, maxAttempts = 30): Promise<void> {
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

  emulatorProcess.stdout?.on("data", (data) => {
    console.log(`[emulator:${port}] ${data.toString().trim()}`);
  });

  emulatorProcess.stderr?.on("data", (data) => {
    console.error(`[emulator:${port}] ${data.toString().trim()}`);
  });

  console.log(`[globalSetup] Waiting for emulator on port ${port} to be ready...`);
  await waitForEmulator(port);
  console.log(`[globalSetup] Emulator on port ${port} is ready`);

  const instance: EmulatorInstance = { port, containerName, process: emulatorProcess };
  activeEmulators.set(port, instance);

  return instance;
}

async function stopEmulator(port: number): Promise<void> {
  const instance = activeEmulators.get(port);
  if (!instance) {
    console.warn(`[globalSetup] No emulator found for port ${port}`);
    return;
  }

  console.log(`[globalSetup] Stopping emulator on port ${port}, container: ${instance.containerName}`);

  const rmProcess = spawn("podman", ["rm", "-f", instance.containerName], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve) => {
    rmProcess.on("close", () => resolve());
  });

  activeEmulators.delete(port);
  console.log(`[globalSetup] Emulator on port ${port} stopped`);
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

  // 3. Start HTTP server
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
      try {
        const instance = await startEmulator();
        res.writeHead(200);
        res.end(JSON.stringify({ emulatorPort: instance.port }));
      } catch (e) {
        console.error(`[globalSetup] Failed to start emulator:`, e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Failed to start emulator" }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/emulator/release") {
      try {
        const body = await readRequestBody(req);
        const { port } = JSON.parse(body);
        await stopEmulator(port);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        console.error(`[globalSetup] Failed to stop emulator:`, e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Failed to stop emulator" }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok", activeEmulators: activeEmulators.size }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(httpPort);
  console.log(`[globalSetup] HTTP server listening on port ${httpPort}`);
}

export async function teardown() {
  console.log(`[globalSetup] Shutting down...`);

  if (server) {
    server.close();
  }

  // Stop all active emulators
  for (const [port] of activeEmulators) {
    await stopEmulator(port);
  }

  console.log(`[globalSetup] Shutdown complete`);
}
