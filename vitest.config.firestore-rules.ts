import { defineConfig } from "vitest/config";
import FlakyReporter from "./test/flakyReporter";

export default defineConfig({
  test: {
    include: ["firestore.rules.test.ts"],
    globalSetup: "./test/globalSetup.ts",
    reporters: ["default", new FlakyReporter({ configName: "firestore-rules" })],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
