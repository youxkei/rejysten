import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import checker from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import tsconfigPaths from "vite-tsconfig-paths";
// @ts-ignore
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import devtools from "solid-devtools/vite";
import { VitePWA } from "vite-plugin-pwa";
import packageJson from "./package.json";

const patchedDepSet = new Set(Object.keys(packageJson.pnpm.patchedDependencies));

export default defineConfig({
  build: {
    minify: false,
  },
  server: {
    // for firebase emulator
    port: 8081,
  },
  optimizeDeps: {
    // @ts-ignore
    //allowNodeBuiltins: ["pouchdb-browser", "pouchdb-utils"],
  },
  resolve: {
    alias: {
      ...Object.entries(packageJson.dependencies).reduce((acc, [dep, version]) => {
        const depWithVersion = `${dep}@${version}`;

        if (patchedDepSet.has(depWithVersion)) {
          return acc;
        }

        if (dep === "firebase") {
          acc[`${dep}/app`] = `https://www.gstatic.com/firebasejs/${version}/firebase-app.js`;
          acc[`${dep}/auth`] = `https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`;
          acc[`${dep}/firestore`] = `https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`;

          return acc;
        }

        acc[dep] = `https://esm.sh/${depWithVersion}`;

        return acc;
      }, {} as Record<string, string>),
    },
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
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Rejysten",
        icons: [{ src: "logo.svg", sizes: "512x512", type: "image/svg+xml" }],
      },
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
    // transformMode: {
    //   //web: [/\.[jt]sx$/],
    // },
    deps: {
      //registerNodeLoader: false,
    },
    //threads: true,
    isolate: true,
    chaiConfig: {
      truncateThreshold: 0,
    },
  },
});
