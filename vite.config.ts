import { execSync } from "node:child_process";

import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import checker from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
// @ts-ignore
import { VitePWA } from "vite-plugin-pwa";
import { playwright } from "@vitest/browser-playwright";
import FlakyReporter from "./test/flakyReporter";

// Committer time of HEAD, embedded into the bundle so the running app can show
// which deploy it is. Empty when git is unavailable.
function commitTime(): string {
  try {
    return execSync("git log -1 --format=%cI").toString().trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  server: {
    // for firebase emulator
    port: 8081,
    allowedHosts: true,
  },
  plugins: [
    solidPlugin({
      hot: !process.env.VITEST,
    }),
    !process.env.VITEST &&
      checker({
        typescript: true,
        eslint: {
          useFlatConfig: true,
          lintCommand: "eslint 'src/**/*.{ts,tsx}'",
        },
      }),
    vanillaExtractPlugin(),
    !process.env.VITEST &&
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "Rejysten",
          icons: [{ src: "logo.svg", sizes: "512x512", type: "image/svg+xml" }],
          share_target: {
            action: "/",
            method: "GET",
            params: {
              title: "title",
              text: "text",
              url: "url",
            },
          },
        },
      }),
  ],
  define: {
    "import.meta.vitest": false,
    __COMMIT_TIME__: JSON.stringify(commitTime()),
  },
  test: {
    exclude: ["functions/**", "node_modules/**", "firestore.rules.test.ts"],
    globalSetup: "./test/globalSetup.ts",
    browser: {
      provider: playwright(),
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["node_modules/@testing-library/jest-dom/vitest.js"],
    reporters: ["default", new FlakyReporter({ configName: "main" })],
    fileParallelism: true,
    retry: 0,
    bail: 0,
    testTimeout: 5_000,
    hookTimeout: 120_000,
  },
  resolve: {
    tsconfigPaths: true,
    conditions: ["development|production", "browser"],
  },
});
