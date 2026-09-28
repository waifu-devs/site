import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // The server reads its settings from process.env (Railway sets them there); in dev they come from .env.
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ""), ...process.env });
  return {
    server: { port: 3000 },
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    // Nitro turns the app into a standalone Node server: .output/server/index.mjs.
    plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
  };
});
