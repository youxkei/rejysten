import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import nodePolyfills from "vite-plugin-node-stdlib-browser";

export default defineConfig({
  server: {
    port: 8080,
  },
  plugins: [nodePolyfills(), react(), checker({ typescript: true })],
});