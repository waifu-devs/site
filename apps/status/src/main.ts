/**
 * status.waifu.dev: runs the checks (Checks.ts) and serves the page.
 *
 * GET /            the page, rendered here (works without its script)
 * GET /?part=main  just the page's contents, which the script swaps in every minute
 * GET /status.json what the page shows, as JSON
 * GET /health      for Railway: this process is up
 * plus its stylesheet, script and font files. Everything is served from here,
 * under a policy that lets the page load nothing from anywhere else.
 *
 * Request logs are method, path and status only (Railway's logs are public):
 * no query, headers or addresses.
 */
import { PgClient } from "@effect/sql-pg";
import { isProbe, PROBE_RESPONSE } from "@waifu-devs/domain/probes";
import { Config, Effect, Layer, Logger, ManagedRuntime } from "effect";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { Checks } from "./Checks.ts";
import { CSS, JS, renderMain, renderPage } from "./Page.ts";
import type { StatusReport } from "./Report.ts";

const PgLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
  maxConnections: Config.integer("DATABASE_POOL_SIZE").pipe(Config.withDefault(4)),
});
const runtime = ManagedRuntime.make(Checks.Default.pipe(Layer.provide(PgLive), Layer.provide(Logger.json)));

const POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const HEADERS = {
  "content-security-policy": POLICY,
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
};

// The font comes with the app, never from a font service.
const fontDir = join(dirname(createRequire(import.meta.url).resolve("@fontsource/m-plus-rounded-1c/package.json")), "files");
const FONTS = new Map<string, Buffer>(
  [400, 700, 800].map((weight) => {
    const name = `m-plus-rounded-1c-latin-${weight}-normal.woff2`;
    return [`/fonts/${name}`, readFileSync(join(fontDir, name))] as const;
  }),
);

const KNOWN = new Set(["/", "/status.json", "/health", "/app.css", "/app.js", ...FONTS.keys()]);

const report = (): Promise<StatusReport | null> =>
  runtime.runPromise(
    Checks.pipe(
      Effect.flatMap((checks) => checks.report),
      // No cause: database errors name internal hosts and addresses, and the logs are public.
      Effect.catchAllCause(() => Effect.logWarning("Status couldn't be read").pipe(Effect.as(null))),
    ),
  );

function send(response: ServerResponse, status: number, type: string, body: string | Buffer, cache: string) {
  response.writeHead(status, { ...HEADERS, "content-type": type, "cache-control": cache });
  response.end(body);
}

const server = createServer(async (request, response) => {
  // Scanners' guesses get a plain 404 before anything else, and aren't logged.
  if (isProbe(request.url ?? "/")) {
    response.writeHead(PROBE_RESPONSE.status, { ...HEADERS, ...PROBE_RESPONSE.headers });
    return void response.end(PROBE_RESPONSE.body);
  }
  const [path, query = ""] = (request.url ?? "/").split("?", 2) as [string, string?];
  response.on("finish", () => {
    // Page views and failures only, by path: never the query, headers or who asked.
    if (path === "/" || response.statusCode >= 500) {
      console.log(JSON.stringify({ message: "Sent HTTP response", method: request.method, path: KNOWN.has(path) ? path : "(other)", status: response.statusCode }));
    }
  });
  try {
    if (request.method !== "GET" && request.method !== "HEAD") return send(response, 405, "text/plain", "", "no-store");
    if (path === "/health") return send(response, 200, "text/plain", "ok", "no-store");
    if (path === "/") {
      const data = await report();
      const html = query === "part=main" ? renderMain(data) : renderPage(data);
      return send(response, data ? 200 : 503, "text/html; charset=utf-8", html, "public, max-age=20");
    }
    if (path === "/status.json") {
      const data = await report();
      return send(response, data ? 200 : 503, "application/json", JSON.stringify(data ?? { error: "unavailable" }), "public, max-age=20");
    }
    if (path === "/app.css") return send(response, 200, "text/css; charset=utf-8", CSS, "public, max-age=3600");
    if (path === "/app.js") return send(response, 200, "text/javascript; charset=utf-8", JS, "public, max-age=3600");
    const font = FONTS.get(path);
    if (font) return send(response, 200, "font/woff2", font, "public, max-age=31536000, immutable");
    return send(response, 404, "text/plain", "Not found", "public, max-age=3600");
  } catch {
    return send(response, 500, "text/plain", "Something went wrong", "no-store");
  }
});

// Start the checks with the server. A failure is told without its cause: database
// errors name internal hosts and addresses, and the logs are public.
try {
  await runtime.runPromise(Checks.pipe(Effect.asVoid));
} catch {
  console.error(JSON.stringify({ message: "Status couldn't start: the database didn't answer" }));
  process.exit(1);
}
const port = Number(process.env.PORT ?? 3000);
// "::" also takes IPv4.
server.listen(port, process.env.HOST ?? "::", () => console.log(JSON.stringify({ message: `Status on port ${port}` })));

const stop = () => {
  server.close();
  void runtime.dispose().then(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
