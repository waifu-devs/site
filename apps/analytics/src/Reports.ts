/**
 * Anonymous health reports: what went wrong and what was slow in our apps, as
 * counts. Two senders, one shape:
 *
 *   POST /v1/fuwa/reports  { schema: "fuwa.report.v1", ... }  hourly from each fuwa
 *     server process, with its own counts and those its web and desktop apps sent it
 *   POST /v1/site/reports  { schema: "site.report.v1", ... }  hourly from the site's
 *     web server, with what visitors' browsers sent it
 *
 * Apps never send here themselves: their own server adds their counts to its
 * report, so no browser or desktop app talks to this service. Nothing in a
 * report names a person: errors are a kind and a place in the code, timings
 * are counts in fixed buckets, usage is how often a feature was used.
 *
 * Senders may add fields within v1 (anything breaking becomes v2). Fields this
 * ingest doesn't know yet are kept in the report's raw JSON.
 */
import { Schema } from "effect";

/** Largest report body read. Reports are usually a few KB; this bounds a busy hour's. */
export const MAX_REPORT_BYTES = 256 * 1024;
/** Entries of each kind one report may carry (fuwa keeps 512 per report). */
const MAX_ENTRIES = 1024;

const Count = Schema.NonNegativeInt;
/** Letters, digits and `_.:/#@-`, as the senders allow. */
const label = (max: number) => Schema.String.pipe(Schema.minLength(1), Schema.maxLength(max), Schema.pattern(/^[A-Za-z0-9_.:/#@-]+$/));
const ULID = Schema.String.pipe(Schema.pattern(/^[0-9A-HJKMNP-TV-Z]{26}$/, { message: () => "Expected a ULID" }));

/** Which app, which build, on what (such as "web", "0.1.0", "chromium", "linux"). */
const Origin = {
  app: label(32),
  version: label(32),
  platform: label(16),
  os: label(16),
};

export const ReportError = Schema.Struct({ ...Origin, kind: label(48), place: label(120), count: Count });
export const ReportTiming = Schema.Struct({
  ...Origin,
  metric: label(96),
  /** Counts per bucket on the report's `bounds_ms`, plus one for anything longer. */
  buckets: Schema.Array(Count).pipe(Schema.maxItems(64)),
  count: Count,
  sum_ms: Count,
});
export const ReportUsage = Schema.Struct({ ...Origin, feature: label(96), count: Count });

const fields = {
  /** Random per report, so one delivered twice counts once. */
  report_id: ULID,
  /** The sender's install id, when it has one (fuwa's, the usage signal's). Never derived from a host, address or person. */
  install_id: Schema.optional(ULID),
  hosting: Schema.optionalWith(Schema.Literal("self_hosted", "hosted"), { default: () => "self_hosted" as const }),
  /** Which part sent it (fuwa: all, directory, shard, gateway; the site: web). */
  part: Schema.optionalWith(label(32), { default: () => "all" }),
  /** The period counted, in Unix milliseconds. */
  since: Count,
  sent_at: Count,
  /** Upper bounds of the timing buckets, in milliseconds. */
  bounds_ms: Schema.Array(Count).pipe(Schema.maxItems(63)),
  errors: Schema.Array(ReportError).pipe(Schema.maxItems(MAX_ENTRIES)),
  timings: Schema.Array(ReportTiming).pipe(Schema.maxItems(MAX_ENTRIES)),
  usage: Schema.Array(ReportUsage).pipe(Schema.maxItems(MAX_ENTRIES)),
  /** Entries the sender left out because its report was full. */
  dropped: Schema.optionalWith(Count, { default: () => 0 }),
};

const report = <S extends string>(schema: S) =>
  Schema.Struct({ schema: Schema.Literal(schema), ...fields }).annotations({ parseOptions: { onExcessProperty: "preserve" } });

export const FuwaReport = report("fuwa.report.v1");
export const SiteReport = report("site.report.v1");
export type Report = typeof FuwaReport.Type | typeof SiteReport.Type;

/** Which product sent a report, from its schema. */
export const sourceOf = (report: Report) => report.schema.split(".")[0]!;
