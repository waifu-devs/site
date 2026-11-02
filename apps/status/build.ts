// Bundles the status service into dist/main.js, for Bun.
export {};
const result = await Bun.build({
  entrypoints: ["src/main.ts"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  sourcemap: "linked",
  // pg optionally requires its native bindings, which we don't use.
  external: ["pg-native"],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
for (const output of result.outputs) console.log(`${output.path} ${(output.size / 1024).toFixed(0)} KB`);
