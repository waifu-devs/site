// Bundles the API (and the workspace domain package) into dist/main.js, and the
// database roles step its deploys run after the migrations into dist/roles.js.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts", "src/roles.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // pg optionally requires its native bindings, which we don't use; sharp is
  // native and loads its prebuilt binary from node_modules at runtime.
  external: ["pg-native", "sharp"],
  // Some bundled CommonJS dependencies call require() for Node builtins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
