import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    api: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
