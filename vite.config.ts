import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import checker from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import tsconfigPaths from "vite-tsconfig-paths";
// @ts-ignore
import { VitePWA } from "vite-plugin-pwa";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  server: {
    // for firebase emulator
    port: 8081,
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
    tsconfigPaths(),
    !process.env.VITEST &&
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "Rejysten",
          icons: [{ src: "logo.svg", sizes: "512x512", type: "image/svg+xml" }],
        },
      }),
  ],
  define: {
    "import.meta.vitest": false,
  },
  test: {
    globalSetup: "./test/globalSetup.ts",
    browser: {
      provider: playwright(),
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["node_modules/@testing-library/jest-dom/vitest.js"],
    fileParallelism: false,
  },
  resolve: {
    conditions: ["development|production", "browser"],
  },
});
