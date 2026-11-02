// Bundles the API (and the workspace domain package) into dist/main.js, and the
// database roles step its deploys run after the migrations into dist/roles.js, for Bun.
export {};
const result = await Bun.build({
  entrypoints: ["src/main.ts", "src/roles.ts"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  sourcemap: "linked",
  // pg optionally requires its native bindings, which we don't use; sharp is
  // native and loads its prebuilt binary from node_modules at runtime.
  external: ["pg-native", "sharp"],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
for (const output of result.outputs) console.log(`${output.path} ${(output.size / 1024).toFixed(0)} KB`);
