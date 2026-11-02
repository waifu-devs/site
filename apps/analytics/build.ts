// Bundles the analytics service (dist/main.js) and its SQL console (dist/sql.js) for Bun.
export {};
const result = await Bun.build({
  entrypoints: ["src/main.ts", "src/sql.ts"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  sourcemap: "linked",
  // DuckDB is native; its prebuilt binary loads from node_modules at runtime.
  external: ["@duckdb/node-api"],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
for (const output of result.outputs) console.log(`${output.path} ${(output.size / 1024).toFixed(0)} KB`);
