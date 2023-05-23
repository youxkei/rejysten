import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import checker from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import tsconfigPaths from "vite-tsconfig-paths";
// @ts-ignore
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import devtools from "solid-devtools/vite";

export default defineConfig({
  server: {
    port: 8080,
  },
  optimizeDeps: {
    // @ts-ignore
    allowNodeBuiltins: ["pouchdb-browser", "pouchdb-utils"],
  },
  plugins: [
    solidPlugin({
      hot: !process.env.VITEST,
    }),
    checker({ typescript: true, eslint: { lintCommand: "eslint './src/**/*.{ts,tsx}'" } }),
    vanillaExtractPlugin(),
    tsconfigPaths(),
    devtools({
      autoname: true,
    }),
    ...(process.env.VITEST ? [] : [nodePolyfills()]),
  ],
  define: {
    "import.meta.vitest": false,
  },
  test: {
    reporters: "verbose",
    includeSource: ["src/**/*.ts{,x}"],
    globals: true,
    environment: "happy-dom",
    transformMode: {
      //web: [/\.[jt]sx$/],
    },
    deps: {
      registerNodeLoader: false,
    },
    threads: true,
    isolate: true,
    outputDiffLines: 1000,
    outputDiffMaxLines: 1000,
  },
});
