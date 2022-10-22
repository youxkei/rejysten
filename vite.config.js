import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import checker from "vite-plugin-checker";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 8080,
  },
  plugins: [
    solidPlugin(),
    nodePolyfills(),
    checker({ typescript: true }),
    vanillaExtractPlugin(),
    tsconfigPaths(),
  ],
});
