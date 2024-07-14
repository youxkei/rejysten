import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import checker from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import tsconfigPaths from "vite-tsconfig-paths";
// @ts-ignore
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    // for firebase emulator
    port: 8081,
  },
  plugins: [
    solidPlugin({
      hot: !process.env.VITEST,
    }),
    checker({
      typescript: true,
      eslint: {
        useFlatConfig: true,
        lintCommand: "eslint 'src/**/*.{ts,tsx}'",
      },
    }),
    vanillaExtractPlugin(),
    tsconfigPaths(),
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
    reporters: "verbose",
    includeSource: ["src/**/*.ts{,x}"],
    globals: true,
    environment: "happy-dom",
    isolate: false,
    chaiConfig: {
      truncateThreshold: 0,
    },
  },
});
