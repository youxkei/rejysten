import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["firebase-functions/**/*.test.js"],
  },
});
