/** The analytics service's HTTP contract. */
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiMiddleware, HttpApiSecurity } from "@effect/platform";
import { Schema } from "effect";
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

// ---------------------------------------------------------------------------

export const Accepted = Schema.Struct({ accepted: Schema.Number });

export class FuwaApi extends HttpApiGroup.make("fuwa")
  .add(
    HttpApiEndpoint.post("ingest", "/v1/fuwa/signals")
      .setPayload(Signal)
      .addSuccess(Accepted, { status: 202 })
      // A signal dated more than a day ahead.
      .addError(HttpApiError.BadRequest)
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
  // Dated more than a day ahead: BadRequest. The lake is unreachable and the buffer is full: ServiceUnavailable.
  .add(
    HttpApiEndpoint.post("fuwa", "/v1/fuwa/reports")
      .setPayload(FuwaReport)
      .addSuccess(Accepted, { status: 202 })
      .addError(HttpApiError.BadRequest)
      .addError(HttpApiError.ServiceUnavailable),
  )
  .add(
    HttpApiEndpoint.post("site", "/v1/site/reports")
      .setPayload(SiteReport)
      .addSuccess(Accepted, { status: 202 })
      .addError(HttpApiError.BadRequest)
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

export class HealthApi extends HttpApiGroup.make("health").add(HttpApiEndpoint.get("health", "/health").addSuccess(Schema.String)) {}

export class Api extends HttpApi.make("analytics").add(FuwaApi).add(ReportsApi).add(HealthApi) {}
