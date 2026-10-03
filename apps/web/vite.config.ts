import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import { SECURITY_HEADERS } from "./src/security.ts";

/**
 * styles/fonts.css, the late font sheet: its faces become a family of their own,
 * "M PLUS Rounded 1c JP", without the Latin ones fonts-first.css already has.
 * Chrome matches every character against every face of a family, so ~380 slices
 * under the site's own family made each layout of the page several times slower.
 */
const lateFonts = {
  postcssPlugin: "late-fonts",
  Once(root: { source?: { input: { file?: string } }; walkAtRules: (name: string, fn: (rule: FontFaceRule) => void) => void }) {
    if (!root.source?.input.file?.split("?")[0].endsWith("/styles/fonts.css")) return;
    root.walkAtRules("font-face", (rule) => {
      let latin = false;
      rule.walkDecls((decl) => {
        if (decl.prop === "src" && /-latin(-ext)?-\d+-normal\./.test(decl.value)) latin = true;
        if (decl.prop === "font-family") decl.value = '"M PLUS Rounded 1c JP"';
      });
      if (latin) rule.remove();
    });
  },
};
type FontFaceRule = { remove: () => void; walkDecls: (fn: (decl: { prop: string; value: string }) => void) => void };

export default defineConfig(({ mode }) => {
  // The server reads its settings from process.env (Railway sets them there); in dev they come from .env.
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ""), ...process.env });
  // Bug reports say which build they're from: the version, and on Railway the commit.
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7);
  const version = commit ? `0.1.0-${commit}` : "0.1.0";
  return {
    define: { __SITE_VERSION__: JSON.stringify(version) },
    server: { port: 3000 },
    css: { postcss: { plugins: [lateFonts] } },
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    // Nitro turns the app into a standalone Node server: .output/server/index.mjs.
    // The security headers go on static files too; pages and server functions also get them in src/server.ts.
    plugins: [tailwindcss(), tanstackStart(), nitro({ routeRules: { "/**": { headers: SECURITY_HEADERS } } }), viteReact()],
    // Fonts stay separate files: inlined, every slice of the Japanese font (used or not)
    // would ride inside the stylesheet that holds back the first paint.
    build: { assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined) },
  };
});
