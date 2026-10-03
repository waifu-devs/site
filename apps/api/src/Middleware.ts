import { HttpApp, HttpMiddleware, HttpServerError, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { isProbe, PROBE_RESPONSE } from "@waifu-devs/domain/probes";
import { Cause, Effect, Exit, Option } from "effect";

/**
 * What every response carries: HTTPS only from now on, no sniffing content
 * types, no framing, and no referrer when someone follows a link away. Pages
 * that set their own Content-Security-Policy (the consent page) keep it.
 */
const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

const withSecurityHeaders = (_request: HttpServerRequest.HttpServerRequest, response: HttpServerResponse.HttpServerResponse) =>
  Effect.succeed(
    HttpServerResponse.setHeaders(response, {
      ...SECURITY_HEADERS,
      "content-security-policy": response.headers["content-security-policy"] ?? "frame-ancestors 'none'",
      // Answers are for whoever asked: Railway's CDN keeps only what says it may.
      "cache-control": response.headers["cache-control"] ?? "no-store",
    }),
  );

/** Largest request body this API reads: an image upload (5 MB) plus room for the encoding. */
export const MAX_BODY_BYTES = 6 * 1024 * 1024;

/**
 * Turns away bodies over MAX_BODY_BYTES: unread when Content-Length says so, else
 * as soon as reading one passes the limit.
 */
export const limitBody = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (Number(request.headers["content-length"] ?? 0) > MAX_BODY_BYTES) return HttpServerResponse.empty({ status: 413 });
    return yield* HttpServerRequest.withMaxBodySize(app, Option.some(MAX_BODY_BYTES));
  }),
);

/**
 * Paths not logged at all. The Railway project (and so its logs) is public, and
 * these carry sign-in codes, states and app addresses.
 */
const UNLOGGED = [/^\/authorize(\/|$)/, /^\/github\//];

/**
 * Logs each request as method, path and status: never the query string (it can
 * hold OAuth codes and client IDs), headers, the client's address, or bodies.
 * A failure adds what kind it was, with anything quoted in its message (where
 * values members sent end up) left out.
 */
const requestLogger = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = request.url.split("?")[0];
    const exit = yield* Effect.exit(app);
    if (!UNLOGGED.some((pattern) => pattern.test(path))) {
      const [response, cause] = Exit.isSuccess(exit) ? [exit.value, Option.none()] : HttpServerError.causeResponseStripped(exit.cause);
      const failed = Option.match(cause, { onNone: () => "", onSome: (cause) => ` (${describe(cause)})` });
      yield* Effect.annotateLogs(Effect.log(`Sent HTTP response${failed}`), {
        "http.method": request.method,
        "http.path": path,
        "http.status": response.status,
      });
    }
    return yield* exit;
  }),
);

/**
 * Scanners' guesses (`/.env`, `/wp-login.php`...) get a 404 before anything
 * routes them, and aren't logged (see @waifu-devs/domain/probes).
 */
const turnAwayProbes = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isProbe(request.url)) return yield* app;
    return HttpServerResponse.text(PROBE_RESPONSE.body, { status: PROBE_RESPONSE.status, headers: PROBE_RESPONSE.headers });
  }),
);

/**
 * Everything every request goes through: scanners turned away first, then the
 * body limit, the security headers (added just before any response is sent,
 * errors included) and the request log.
 */
export const harden = HttpMiddleware.make((app) =>
  turnAwayProbes(requestLogger(HttpApp.withPreResponseHandler(limitBody(app), withSecurityHeaders))),
);

/** A failure in a few words: its tag, or a defect's name and message with quoted values cut out. */
function describe(cause: Cause.Cause<unknown>): string {
  const failure = Cause.failureOption(cause);
  if (Option.isSome(failure)) return tagOf(failure.value);
  const defect = Cause.dieOption(cause);
  if (Option.isNone(defect)) return Cause.isInterruptedOnly(cause) ? "interrupted" : "failed";
  const error = defect.value;
  if (!(error instanceof Error)) return tagOf(error);
  const where = error.stack?.split("\n").find((line) => line.trim().startsWith("at "))?.trim() ?? "";
  return `${error.name}: ${redact(error.message)} ${where}`.trim();
}

function tagOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "_tag" in error) return String(error._tag);
  return error instanceof Error ? error.name : typeof error;
}

/** Drops anything in quotes (Postgres and JSON errors quote the values they choke on) and keeps it short. */
function redact(message: string): string {
  return message
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "…")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}
