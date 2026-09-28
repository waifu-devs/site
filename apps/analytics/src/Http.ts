import { HttpApiBuilder, HttpApiError } from "@effect/platform";
import { Clock, Config, Effect, Layer, Option, Redacted } from "effect";
import { timingSafeEqual } from "node:crypto";
import { Api, ReadAccess } from "./Api.ts";
import { Ingest } from "./Ingest.ts";
import { Lake } from "./Lake.ts";
import { summary } from "./Summary.ts";

/** Clocks drift, but not by a day: anything dated later than this is refused. */
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

const FuwaLive = HttpApiBuilder.group(Api, "fuwa", (handlers) =>
  Effect.gen(function* () {
    const ingest = yield* Ingest;
    const lake = yield* Lake;
    return handlers
      .handle("ingest", ({ payload }) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          if (payload.events.some((event) => event.at.getTime() > now + MAX_CLOCK_SKEW_MS)) return yield* new HttpApiError.BadRequest();
          const accepted = yield* ingest
            .add(payload, new Date(now))
            .pipe(Effect.catchTag("IngestFull", () => new HttpApiError.ServiceUnavailable()));
          return { accepted };
        }),
      )
      .handle("summary", ({ urlParams }) => summary(urlParams.days ?? 30).pipe(Effect.provideService(Lake, lake), Effect.orDie));
  }),
);

const HealthLive = HttpApiBuilder.group(Api, "health", (handlers) => handlers.handle("health", () => Effect.succeed("ok")));

/** Reading needs ANALYTICS_READ_TOKEN as a bearer token; while it isn't set, nobody can read. */
export const ReadAccessLive = Layer.effect(
  ReadAccess,
  Effect.gen(function* () {
    const token = yield* Config.option(Config.redacted("ANALYTICS_READ_TOKEN"));
    const expected = Option.filter(
      Option.map(token, (token) => Buffer.from(Redacted.value(token))),
      (token) => token.length > 0,
    );
    if (Option.isNone(expected)) yield* Effect.logWarning("ANALYTICS_READ_TOKEN is not set, so /v1/fuwa/summary refuses every request.");
    return ReadAccess.of({
      bearer: (given) => {
        const bytes = Buffer.from(Redacted.value(given));
        return Option.isSome(expected) && bytes.length === expected.value.length && timingSafeEqual(bytes, expected.value)
          ? Effect.void
          : new HttpApiError.Unauthorized();
      },
    });
  }),
);

export const HttpLive = HttpApiBuilder.api(Api).pipe(Layer.provide([FuwaLive, HealthLive]));
