import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import checker from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 8080,
  },
  optimizeDeps: {
    // @ts-ignore
    allowNodeBuiltins: ["pouchdb-browser", "pouchdb-utils"],
  },
  plugins: [
    solidPlugin(),
    checker({ typescript: true }),
    vanillaExtractPlugin(),
    tsconfigPaths(),
  ],
  define: {
    "import.meta.vitest": false,
  },
  test: {
    includeSource: ["src/**/*.ts{,x}"],
    globals: true,
    environment: "jsdom",
    transformMode: {
      web: [/\.[jt]sx?$/],
    },
    deps: {
      registerNodeLoader: true,
    },
    threads: true,
    isolate: true,
    setupFiles: ["src/rxdb/test.tsx"],
  },
  resolve: {
    conditions: ["development", "browser"],
  },
});
