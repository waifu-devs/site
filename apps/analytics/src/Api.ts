/** The analytics service's HTTP contract. */
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiMiddleware, HttpApiSecurity } from "@effect/platform";
import { Schema } from "effect";
import { TooMany } from "./Limits.ts";
import { FuwaReport, SiteReport } from "./Reports.ts";
import { Signal } from "./Signals.ts";

// ---------------------------------------------------------------------------
// Reading: a bearer token only we have (ANALYTICS_READ_TOKEN).

export class ReadAccess extends HttpApiMiddleware.Tag<ReadAccess>()("ReadAccess", {
  failure: HttpApiError.Unauthorized,
  security: { bearer: HttpApiSecurity.bearer },
}) {}

const Count = Schema.Number;

/** One UTC day for one kind of hosting (see the `daily` view). */
export const Day = Schema.Struct({
  day: Schema.String,
  hosting: Schema.String,
  installs: Count,
  accounts: Count,
  accounts_active_1d: Count,
  accounts_active_30d: Count,
  servers: Count,
  members: Count,
  channels: Count,
  messages: Count,
  message_bytes: Count,
  attachments: Count,
  attachment_bytes: Count,
  storage_bytes: Count,
  /** Sent during the period the day's signals cover. */
  messages_sent: Count,
  events: Count,
});

export const Summary = Schema.Struct({
  days: Schema.Array(Day),
  /** Installs seen in the last 7 days, by the version they last reported. */
  versions: Schema.Array(Schema.Struct({ version: Schema.String, hosting: Schema.String, installs: Count })),
});
export type Summary = typeof Summary.Type;

/** The bugs, slow paths and feature use in health reports over the last `days`. */
export const ReportSummary = Schema.Struct({
  days: Count,
  /** Failures by kind and place, most frequent first. */
  errors: Schema.Array(
    Schema.Struct({
      source: Schema.String,
      app: Schema.String,
      version: Schema.String,
      kind: Schema.String,
      place: Schema.String,
      count: Count,
      /** Distinct installs that reported it (fuwa instances; the site counts as one). */
      installs: Count,
      platforms: Schema.Array(Schema.String),
      oses: Schema.Array(Schema.String),
      first_seen: Schema.String,
      last_seen: Schema.String,
    }),
  ),
  /**
   * Timings, slowest first by p95. Percentiles are the upper bound of the bucket
   * they fall in; one past the last bucket reads as the last bound.
   */
  slow: Schema.Array(
    Schema.Struct({
      source: Schema.String,
      app: Schema.String,
      metric: Schema.String,
      count: Count,
      avg_ms: Count,
      p50_ms: Count,
      p95_ms: Count,
      p99_ms: Count,
      /** How many took longer than a second. */
      over_1s: Count,
    }),
  ),
  /** Feature use, most used first. */
  usage: Schema.Array(Schema.Struct({ source: Schema.String, app: Schema.String, feature: Schema.String, count: Count })),
});
export type ReportSummary = typeof ReportSummary.Type;

/**
 * The stats page's history: usage signals and health reports, day by day, over
 * the last `days`. `usage` and `problems` are the summaries above for the same days.
 */
export const Insights = Schema.Struct({
  days: Count,
  usage: Summary,
  problems: ReportSummary,
  /** Reports received per day and sender kind, and how many distinct senders sent them. */
  reports: Schema.Array(Schema.Struct({ day: Schema.String, source: Schema.String, reports: Count, senders: Count, dropped: Count })),
  /** Failures counted per day and app, and how many different ones. */
  errors: Schema.Array(Schema.Struct({ day: Schema.String, source: Schema.String, app: Schema.String, count: Count, kinds: Count })),
  /** The busiest timed things, per day. */
  timings: Schema.Array(
    Schema.Struct({
      day: Schema.String,
      source: Schema.String,
      app: Schema.String,
      metric: Schema.String,
      count: Count,
      avg_ms: Count,
      p50_ms: Count,
      p95_ms: Count,
    }),
  ),
  /** The most used features, per day. */
  features: Schema.Array(Schema.Struct({ day: Schema.String, source: Schema.String, app: Schema.String, feature: Schema.String, count: Count })),
});
export type Insights = typeof Insights.Type;

// ---------------------------------------------------------------------------

export const Accepted = Schema.Struct({ accepted: Schema.Number });

export class FuwaApi extends HttpApiGroup.make("fuwa")
  .add(
    HttpApiEndpoint.post("ingest", "/v1/fuwa/signals")
      .setPayload(Signal)
      .addSuccess(Accepted, { status: 202 })
      // A signal dated more than a day ahead.
      .addError(HttpApiError.BadRequest)
      // Too many from this install this hour, or from everyone this minute; try again later.
      .addError(TooMany)
      // The lake is unreachable and the buffer is full; try again later.
      .addError(HttpApiError.ServiceUnavailable),
  )
  .add(
    HttpApiEndpoint.get("summary", "/v1/fuwa/summary")
      .setUrlParams(Schema.Struct({ days: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 366))) }))
      .addSuccess(Summary)
      .middleware(ReadAccess),
  ) {}

/** Health reports: errors, timings and feature use from fuwa and the site, and reading them back. */
export class ReportsApi extends HttpApiGroup.make("reports")
  // Dated more than a day ahead: BadRequest. Too many from this sender this hour, or from everyone this
  // minute: TooMany. The lake is unreachable and the buffer is full: ServiceUnavailable.
  .add(
    HttpApiEndpoint.post("fuwa", "/v1/fuwa/reports")
      .setPayload(FuwaReport)
      .addSuccess(Accepted, { status: 202 })
      .addError(HttpApiError.BadRequest)
      .addError(TooMany)
      .addError(HttpApiError.ServiceUnavailable),
  )
  // Only from the site's web server, over Railway's private network: through the public domain, Forbidden.
  .add(
    HttpApiEndpoint.post("site", "/v1/site/reports")
      .setPayload(SiteReport)
      .addSuccess(Accepted, { status: 202 })
      .addError(HttpApiError.BadRequest)
      .addError(HttpApiError.Forbidden)
      .addError(TooMany)
      .addError(HttpApiError.ServiceUnavailable),
  )
  .add(
    HttpApiEndpoint.get("summary", "/v1/reports/summary")
      .setUrlParams(
        Schema.Struct({
          days: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 366))),
          source: Schema.optional(Schema.Literal("fuwa", "site")),
        }),
      )
      .addSuccess(ReportSummary)
      .middleware(ReadAccess),
  ) {}

/**
 * Reading the history: the site's web server asks over Railway's private network
 * (for the stats page), and anyone else needs the read token.
 */
export class InsightsApi extends HttpApiGroup.make("insights").add(
  HttpApiEndpoint.get("history", "/v1/insights")
    .setUrlParams(Schema.Struct({ days: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 400))) }))
    .addSuccess(Insights)
    .addError(HttpApiError.Unauthorized),
) {}

export class HealthApi extends HttpApiGroup.make("health").add(HttpApiEndpoint.get("health", "/health").addSuccess(Schema.String)) {}

export class Api extends HttpApi.make("analytics").add(FuwaApi).add(ReportsApi).add(InsightsApi).add(HealthApi) {}
