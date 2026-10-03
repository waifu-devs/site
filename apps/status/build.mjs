// Bundles the status service into dist/main.js.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // pg optionally requires its native bindings, which we don't use.
  external: ["pg-native"],
  // Some bundled CommonJS dependencies call require() for Node builtins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: "info",
});
