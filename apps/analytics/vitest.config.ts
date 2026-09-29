import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The first run may download DuckDB's DuckLake extension.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
