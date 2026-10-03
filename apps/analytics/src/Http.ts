import { HttpApiBuilder, HttpApiError } from "@effect/platform";
import { Clock, Config, Effect, Layer, Option, Redacted } from "effect";
import { timingSafeEqual } from "node:crypto";
import { Api, ReadAccess } from "./Api.ts";
import { Ingest } from "./Ingest.ts";
import { Lake } from "./Lake.ts";
import { fromInside, Limits } from "./Limits.ts";
import { type Report, sourceOf } from "./Reports.ts";
import { reportSummary } from "./ReportSummary.ts";
import { summary } from "./Summary.ts";

/** Clocks drift, but not by a day: anything dated later than this is refused. */
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

const FuwaLive = HttpApiBuilder.group(Api, "fuwa", (handlers) =>
  Effect.gen(function* () {
    const ingest = yield* Ingest;
    const lake = yield* Lake;
    const limits = yield* Limits;
    return handlers
      .handle("ingest", ({ payload }) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          if (payload.sent_at > now + MAX_CLOCK_SKEW_MS) return yield* new HttpApiError.BadRequest();
          yield* limits.take(`signal:${payload.install_id}`);
          yield* ingest.add(payload, new Date(now)).pipe(Effect.catchTag("IngestFull", () => new HttpApiError.ServiceUnavailable()));
          return { accepted: 1 };
        }),
      )
      .handle("summary", ({ urlParams }) => summary(urlParams.days ?? 30).pipe(Effect.provideService(Lake, lake), Effect.orDie));
  }),
);

const ReportsLive = HttpApiBuilder.group(Api, "reports", (handlers) =>
  Effect.gen(function* () {
    const ingest = yield* Ingest;
    const lake = yield* Lake;
    const limits = yield* Limits;
    const take = (report: Report) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        if (report.sent_at > now + MAX_CLOCK_SKEW_MS) return yield* new HttpApiError.BadRequest();
        // By install when the sender has one; the site's web server (and any sender without one) by source.
        yield* limits.take(`report:${sourceOf(report)}:${report.install_id ?? "-"}`);
        yield* ingest.addReport(report, new Date(now)).pipe(Effect.catchTag("IngestFull", () => new HttpApiError.ServiceUnavailable()));
        return { accepted: 1 };
      });
    return handlers
      .handle("fuwa", ({ payload }) => take(payload))
      .handle("site", ({ payload }) =>
        Effect.gen(function* () {
          if (!(yield* fromInside)) return yield* new HttpApiError.Forbidden();
          return yield* take(payload);
        }),
      )
      .handle("summary", ({ urlParams }) =>
        reportSummary(urlParams.days ?? 7, urlParams.source).pipe(Effect.provideService(Lake, lake), Effect.orDie),
      );
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
    if (Option.isNone(expected)) yield* Effect.logWarning("ANALYTICS_READ_TOKEN is not set, so the summaries refuse every request.");
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

export const HttpLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide([FuwaLive, ReportsLive, HealthLive]),
  Layer.provide(Limits.Default),
);
