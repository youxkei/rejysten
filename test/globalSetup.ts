import http from "http";
import net from "net";
import { spawn, type ChildProcess } from "child_process";
import type { TestProject } from "vitest/node";

const CONTAINER_PORT = 8080;

let server: http.Server | undefined;
let emulatorProcess: ChildProcess | undefined;
let emulatorPort: number;
let httpPort: number;
let containerName: string;

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

async function clearDatabase(port: number, database: string = "(default)"): Promise<void> {
  await fetch(`http://localhost:${port}/emulator/v1/projects/demo/databases/${database}/documents`, {
    method: "DELETE",
  });
}

export async function setup(project: TestProject) {
  // Skip if already set up
  if (httpPort) {
    console.log(`[globalSetup] Already set up, skipping (HTTP port: ${httpPort})`);
    project.provide("httpPort", httpPort);
    return;
  }

  // 1. Find free ports for HTTP server and emulator
  httpPort = await findFreePort();
  emulatorPort = await findFreePort();
  containerName = `firebase-emulator-test-${crypto.randomUUID()}`;

  console.log(
    `[globalSetup] Using HTTP port: ${httpPort}, emulator port: ${emulatorPort}, container: ${containerName}`,
  );

  // 2. Provide HTTP port to tests
  project.provide("httpPort", httpPort);

  // 3. Start HTTP server
  server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${httpPort}`);

    if (req.method === "GET" && url.pathname === "/emulator-port") {
      res.writeHead(200);
      res.end(JSON.stringify({ emulatorPort }));
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/database") {
      // Clear the database
      const database = url.searchParams.get("database") ?? "(default)";
      try {
        await clearDatabase(emulatorPort, database);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        console.error(`[globalSetup] Failed to clear database:`, e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Failed to clear database" }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok", emulatorPort }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(httpPort);
  console.log(`[globalSetup] HTTP server listening on port ${httpPort}`);

  // 4. Start podman emulator with port mapping
  emulatorProcess = spawn(
    "podman",
    [
      "run",
      "--rm",
      "--name",
      containerName,
      "-p",
      `${emulatorPort}:${CONTAINER_PORT}`,
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
    console.log(`[emulator] ${data.toString().trim()}`);
  });

  emulatorProcess.stderr?.on("data", (data) => {
    console.error(`[emulator] ${data.toString().trim()}`);
  });

  // 5. Wait for emulator to be ready
  console.log(`[globalSetup] Waiting for emulator to be ready...`);
  await waitForEmulator(emulatorPort);
  console.log(`[globalSetup] Emulator is ready`);
}

export async function teardown() {
  console.log(`[globalSetup] Shutting down...`);

  if (server) {
    server.close();
  }

  if (emulatorProcess) {
    // Kill the container using podman kill
    const killProcess = spawn("podman", ["kill", containerName], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    await new Promise<void>((resolve) => {
      killProcess.on("close", () => resolve());
    });
  }

  console.log(`[globalSetup] Shutdown complete`);
}
