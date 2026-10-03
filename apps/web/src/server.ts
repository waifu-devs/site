/**
 * The web server's entry: TanStack Start's own handler, with request bodies
 * capped before anything parses them and the security headers on every response.
 */
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { isProbe, PROBE_RESPONSE } from "@waifu-devs/domain/probes";
import { contentSecurityPolicy, MAX_BODY_BYTES, SECURITY_HEADERS } from "./security.ts";

// Pictures are served by the API (see components/Avatar.tsx).
const apiOrigin = new URL(process.env.API_URL ?? "http://localhost:4000").origin;

// Vite's dev server injects its own inline scripts, which carry no nonce.
const csp = (nonce?: string) => (import.meta.env.DEV ? undefined : contentSecurityPolicy({ nonce, apiOrigin }));

/** Pages: the router made a nonce for this request (router.tsx) and put it on its inline scripts. */
const handler = createStartHandler((ctx) => {
  const policy = csp(ctx.router.options.ssr?.nonce);
  if (policy) ctx.responseHeaders.set("content-security-policy", policy);
  return defaultStreamHandler(ctx);
});

/**
 * Turns away a body over MAX_BODY_BYTES: at once when Content-Length says so,
 * otherwise by failing the read as it passes the limit, so a server function
 * never buffers (or parses as FormData) more than that.
 */
function limitBody(request: Request): Request | Response {
  if (!request.body) return request;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return new Response("Too big.", { status: 413 });
  let size = 0;
  const limited = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > MAX_BODY_BYTES) controller.error(new Error("request body too large"));
        else controller.enqueue(chunk);
      },
    }),
  );
  // Nitro's request is its own Request-like object, so this one is built from its parts.
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: limited,
    signal: request.signal,
    duplex: "half",
  } as RequestInit);
}

/**
 * Every other response (server functions, server routes, redirects) gets the headers too, and a CSP of its own.
 * Pages are made for whoever is signed in and carry a fresh nonce, so a response that doesn't say how long it
 * may be kept is kept by nobody but that browser: Railway's CDN never stores it.
 */
function withSecurityHeaders(response: Response): Response {
  // Some responses (redirects) have immutable headers.
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
  if (!secured.headers.has("cache-control")) secured.headers.set("cache-control", "private, no-cache");
  const policy = csp();
  if (policy && !secured.headers.has("content-security-policy")) secured.headers.set("content-security-policy", policy);
  return secured;
}

export default createServerEntry({
  async fetch(request: Request) {
    // Scanners' guesses (/.env, /wp-login.php...) get a 404 before the router sees them.
    if (isProbe(new URL(request.url).pathname)) {
      return withSecurityHeaders(new Response(PROBE_RESPONSE.body, { status: PROBE_RESPONSE.status, headers: PROBE_RESPONSE.headers }));
    }
    const limited = limitBody(request);
    if (limited instanceof Response) return withSecurityHeaders(limited);
    return withSecurityHeaders(await handler(limited));
  },
});
