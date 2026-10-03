/**
 * How much anyone may send. Senders are counted by the id they send (a fuwa
 * install's random id, or the source when there's none), never by address, and
 * everyone together shares one allowance a minute, so nobody can fill the
 * buffer and turn real senders away, nor store more than a little in the lake.
 */
import { HttpApiSchema, HttpServerRequest } from "@effect/platform";
import { Clock, Config, Effect, Schema } from "effect";

/** Too many from one sender this hour, or from everyone this minute. Senders keep it for later. */
export class TooMany extends Schema.TaggedError<TooMany>()("TooMany", {}, HttpApiSchema.annotations({ status: 429 })) {}

/** Senders remembered at once; past it, new ones wait for the hour to turn. */
const MAX_SENDERS = 100_000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export class Limits extends Effect.Service<Limits>()("Limits", {
  effect: Effect.gen(function* () {
    // A fuwa install sends one signal a day and a report an hour from each of its parts
    // (a split one has several, and each also sends on shutdown); the site's web server
    // sends a report every 10 minutes.
    const perSenderHour = yield* Config.integer("INGEST_MAX_PER_SENDER_HOUR").pipe(Config.withDefault(30));
    const perMinute = yield* Config.integer("INGEST_MAX_PER_MINUTE").pipe(Config.withDefault(300));
    let minute = { started: 0, taken: 0 };
    let hour = 0;
    let senders = new Map<string, number>();

    /** Counts one request from `sender`, or fails with TooMany. */
    const take = (sender: string): Effect.Effect<void, TooMany> =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        if (now - minute.started >= MINUTE_MS) minute = { started: now, taken: 0 };
        if (Math.floor(now / HOUR_MS) !== hour) {
          hour = Math.floor(now / HOUR_MS);
          senders = new Map();
        }
        const sent = senders.get(sender) ?? 0;
        if (minute.taken >= perMinute || sent >= perSenderHour || (sent === 0 && senders.size >= MAX_SENDERS)) return yield* new TooMany();
        minute.taken++;
        senders.set(sender, sent + 1);
      });

    return { take } as const;
  }),
}) {}

/** Headers Railway's edge adds to every request from the internet; requests over the private network have none. */
const EDGE_HEADERS = ["x-forwarded-for", "x-real-ip", "forwarded", "x-railway-edge", "x-railway-request-id"];
/** Hosts only reachable from inside: Railway's private network, or this machine. */
const PRIVATE_HOST = /^(?:[a-z0-9-]+\.railway\.internal|localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

/**
 * Whether the request came over Railway's private network (or from this
 * machine) rather than through the public domain: addressed to a private host
 * and without any of the headers the edge adds. Only looks at whether those
 * headers are there, never at what they say.
 */
export const fromInside = Effect.map(HttpServerRequest.HttpServerRequest, (request) => {
  if (EDGE_HEADERS.some((name) => request.headers[name] !== undefined)) return false;
  const host = request.headers.host;
  if (host === undefined) return false;
  return PRIVATE_HOST.test(host.toLowerCase());
});
