import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";

export default defineConfig({
  server: {
    port: 8080,
  },
  plugins: [react(), checker({ typescript: true })],
});
