import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import checker from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
// @ts-ignore
import { VitePWA } from "vite-plugin-pwa";
import { playwright } from "@vitest/browser-playwright";

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
  },
  test: {
    exclude: ["functions/**", "node_modules/**", "firebase-functions/**"],
    globalSetup: "./test/globalSetup.ts",
    browser: {
      provider: playwright(),
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["node_modules/@testing-library/jest-dom/vitest.js"],
    fileParallelism: true,
    retry: 3,
    bail: 1,
    testTimeout: 5_000,
    hookTimeout: 120_000,
  },
  resolve: {
    tsconfigPaths: true,
    conditions: ["development|production", "browser"],
  },
});
