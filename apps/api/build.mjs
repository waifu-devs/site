// Bundles the API (and the workspace domain package) into dist/main.js.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // pg optionally requires its native bindings; we don't use them.
  external: ["pg-native"],
  // Some bundled CommonJS dependencies call require() for Node builtins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
