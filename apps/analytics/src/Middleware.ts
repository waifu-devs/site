import { HttpApp, HttpMiddleware, HttpServerError, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Cause, Effect, Exit, Option } from "effect";
import { limitBody } from "./App.ts";

/**
 * What every response carries: HTTPS only from now on, no sniffing content
 * types, no framing, and no referrer when someone follows a link away. Nothing
 * here is a page, so nothing may load or frame anything.
 */
const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
};

const withSecurityHeaders = (_request: HttpServerRequest.HttpServerRequest, response: HttpServerResponse.HttpServerResponse) =>
  Effect.succeed(HttpServerResponse.setHeaders(response, SECURITY_HEADERS));

/**
 * Logs each request as method, path and status: never the query string, headers,
 * the client's address, or bodies (the Railway project, logs included, is public).
 * A failure adds what kind it was, with anything quoted in its message (where
 * values senders sent end up) left out.
 */
const requestLogger = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = request.url.split("?")[0];
    const exit = yield* Effect.exit(app);
    const [response, cause] = Exit.isSuccess(exit) ? [exit.value, Option.none()] : HttpServerError.causeResponseStripped(exit.cause);
    const failed = Option.match(cause, { onNone: () => "", onSome: (cause) => ` (${describe(cause)})` });
    yield* Effect.annotateLogs(Effect.log(`Sent HTTP response${failed}`), {
      "http.method": request.method,
      "http.path": path,
      "http.status": response.status,
    });
    return yield* exit;
  }),
);

/**
 * Everything every request goes through: the body limit, the security headers
 * (added just before any response is sent, errors included) and the request log.
 */
export const harden = HttpMiddleware.make((app) => requestLogger(HttpApp.withPreResponseHandler(limitBody(app), withSecurityHeaders)));

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
