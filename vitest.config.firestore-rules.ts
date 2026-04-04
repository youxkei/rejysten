import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["firestore.rules.test.ts"],
    globalSetup: "./test/globalSetup.ts",
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
