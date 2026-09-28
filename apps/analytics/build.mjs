// Bundles the analytics service (dist/main.js) and its SQL console (dist/sql.js).
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts", "src/sql.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // DuckDB is native; its prebuilt binary loads from node_modules at runtime.
  external: ["@duckdb/node-api"],
  // Some bundled CommonJS dependencies call require() for Node builtins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
