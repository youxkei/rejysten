import fs from "fs";
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    httpPort: number;
  }
}

const ALLOWED_UID = "XoVR64j2pfgnlX8L05kL5V96y8n1";
const WRONG_UID = "wrongUidUser123";

let testEnv: RulesTestEnvironment;
let emulatorPort: number;

function getTestServerUrl(): string {
  const httpPort = inject("httpPort");
  return `http://localhost:${httpPort}`;
}

async function acquireEmulator(): Promise<number> {
  const res = await fetch(`${getTestServerUrl()}/emulator/acquire`, { method: "POST" });
  const data = await res.json();
  return data.emulatorPort;
}

async function releaseEmulator(port: number): Promise<void> {
  await fetch(`${getTestServerUrl()}/emulator/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ port }),
  });
}

beforeAll(async () => {
  emulatorPort = await acquireEmulator();

  const rules = fs.readFileSync("firestore.rules", "utf8");

  testEnv = await initializeTestEnvironment({
    projectId: "demo",
    firestore: {
      rules,
      host: "localhost",
      port: emulatorPort,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
  if (emulatorPort) {
    await releaseEmulator(emulatorPort);
  }
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("firestore security rules", () => {
  describe("authenticated with allowed UID", () => {
    it("can read a document", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("someCollection").doc("doc1").set({ field: "value" });
      });
      const db = testEnv.authenticatedContext(ALLOWED_UID).firestore();
      await assertSucceeds(db.collection("someCollection").doc("doc1").get());
    });

    it("can create a document", async () => {
      const db = testEnv.authenticatedContext(ALLOWED_UID).firestore();
      await assertSucceeds(db.collection("someCollection").doc("doc1").set({ field: "value" }));
    });

    it("can delete a document", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("someCollection").doc("doc1").set({ field: "value" });
      });
      const db = testEnv.authenticatedContext(ALLOWED_UID).firestore();
      await assertSucceeds(db.collection("someCollection").doc("doc1").delete());
    });

    it("can update a document in a non-batchVersion collection", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("someCollection").doc("doc1").set({ field: "value" });
      });
      const db = testEnv.authenticatedContext(ALLOWED_UID).firestore();
      await assertSucceeds(db.collection("someCollection").doc("doc1").update({ field: "newValue" }));
    });
  });

  describe("batchVersion update rules", () => {
    it("allows update when prevVersion matches current version", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("batchVersion").doc("singleton").set({ version: "v1", data: "old" });
      });
      const db = testEnv.authenticatedContext(ALLOWED_UID).firestore();
      await assertSucceeds(
        db.collection("batchVersion").doc("singleton").update({ prevVersion: "v1", version: "v2", data: "new" }),
      );
    });

    it("allows update when version is __INITIAL__", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("batchVersion").doc("singleton").set({ version: "v1", data: "old" });
      });
      const db = testEnv.authenticatedContext(ALLOWED_UID).firestore();
      await assertSucceeds(
        db
          .collection("batchVersion")
          .doc("singleton")
          .update({ prevVersion: "wrong", version: "__INITIAL__", data: "reset" }),
      );
    });

    it("denies update when prevVersion does not match and version is not __INITIAL__", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("batchVersion").doc("singleton").set({ version: "v5", data: "old" });
      });
      const db = testEnv.authenticatedContext(ALLOWED_UID).firestore();
      await assertFails(
        db.collection("batchVersion").doc("singleton").update({ prevVersion: "v3", version: "v6", data: "new" }),
      );
    });
  });

  describe("authenticated with wrong UID", () => {
    it("cannot read a document", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("someCollection").doc("doc1").set({ field: "value" });
      });
      const db = testEnv.authenticatedContext(WRONG_UID).firestore();
      await assertFails(db.collection("someCollection").doc("doc1").get());
    });

    it("cannot create a document", async () => {
      const db = testEnv.authenticatedContext(WRONG_UID).firestore();
      await assertFails(db.collection("someCollection").doc("doc1").set({ field: "value" }));
    });

    it("cannot delete a document", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("someCollection").doc("doc1").set({ field: "value" });
      });
      const db = testEnv.authenticatedContext(WRONG_UID).firestore();
      await assertFails(db.collection("someCollection").doc("doc1").delete());
    });

    it("cannot update a document", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("someCollection").doc("doc1").set({ field: "value" });
      });
      const db = testEnv.authenticatedContext(WRONG_UID).firestore();
      await assertFails(db.collection("someCollection").doc("doc1").update({ field: "newValue" }));
    });
  });

  describe("unauthenticated access", () => {
    it("cannot read a document", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("someCollection").doc("doc1").set({ field: "value" });
      });
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection("someCollection").doc("doc1").get());
    });

    it("cannot create a document", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection("someCollection").doc("doc1").set({ field: "value" }));
    });

    it("cannot delete a document", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("someCollection").doc("doc1").set({ field: "value" });
      });
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection("someCollection").doc("doc1").delete());
    });

    it("cannot update a document", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection("someCollection").doc("doc1").set({ field: "value" });
      });
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection("someCollection").doc("doc1").update({ field: "newValue" }));
    });
  });
});
