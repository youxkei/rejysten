import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import FlakyReporter from "./test/flakyReporter";

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2025-01-01",
      },
    }),
  ],
  test: {
    include: ["functions/**/*.test.ts"],
    reporters: ["default", new FlakyReporter({ configName: "functions" })],
  },
});
