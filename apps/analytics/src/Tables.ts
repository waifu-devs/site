/**
 * The lake's tables and views. Usage signals are in the `fuwa` schema of the
 * DuckLake, health reports in `reports`. Rows are append-only; something
 * delivered twice lands twice, so the views count each signal
 * (install_id, sent_at) and each report (report_id) once.
 */
import type { DuckDBValue } from "@duckdb/node-api";
import { Effect } from "effect";
import { Lake } from "./Lake.ts";
import { extrasOf, type Report, sourceOf } from "./Reports.ts";
import type { Signal } from "./Signals.ts";

/** One row per signal. New columns go at the end (and into `migrate`). */
const SIGNAL_COLUMNS = [
  ["received_at", "TIMESTAMPTZ"],
  ["sent_at", "TIMESTAMPTZ"],
  ["schema_id", "VARCHAR"],
  ["install_id", "VARCHAR"],
  ["hosting", "VARCHAR"],
  ["version", "VARCHAR"],
  ["os", "VARCHAR"],
  ["arch", "VARCHAR"],
  ["uptime_seconds", "BIGINT"],
  ["local_accounts", "VARCHAR"],
  ["linked_accounts", "BOOLEAN"],
  ["server_creation", "VARCHAR"],
  ["encryption", "BOOLEAN"],
  ["limits_configured", "BOOLEAN"],
  ["accounts", "BIGINT"],
  ["accounts_active_1d", "BIGINT"],
  ["accounts_active_30d", "BIGINT"],
  ["servers", "BIGINT"],
  ["discoverable_servers", "BIGINT"],
  ["members", "BIGINT"],
  ["channels", "BIGINT"],
  ["messages", "BIGINT"],
  ["messages_sent", "BIGINT"],
  ["message_bytes", "BIGINT"],
  ["attachments", "BIGINT"],
  ["attachment_bytes", "BIGINT"],
  ["events", "BIGINT"],
  ["storage_bytes", "BIGINT"],
  /** The whole signal as sent, including fields added since these columns. */
  ["raw", "JSON"],
] as const;

type Columns = ReadonlyArray<readonly [name: string, type: string]>;
export type SignalRow = { [K in (typeof SIGNAL_COLUMNS)[number] as K[0]]: unknown };

/** What every report row starts with: which report, from whom, when. */
const REPORT_KEY = [
  ["received_at", "TIMESTAMPTZ"],
  ["sent_at", "TIMESTAMPTZ"],
  /** "fuwa" or "site". */
  ["source", "VARCHAR"],
  ["report_id", "VARCHAR"],
  ["install_id", "VARCHAR"],
  ["hosting", "VARCHAR"],
  ["part", "VARCHAR"],
] as const;
/** Which app, which build, on what. */
const ORIGIN = [
  ["app", "VARCHAR"],
  ["version", "VARCHAR"],
  ["platform", "VARCHAR"],
  ["os", "VARCHAR"],
] as const;

/** One row per report, with the whole report as sent. New columns go at the end. */
const REPORT_COLUMNS = [
  ...REPORT_KEY,
  ["schema_id", "VARCHAR"],
  ["since", "TIMESTAMPTZ"],
  ["dropped", "BIGINT"],
  ["raw", "JSON"],
] as const;
/** One row per kind of failure in one place, per report. */
const ERROR_COLUMNS = [...REPORT_KEY, ...ORIGIN, ["kind", "VARCHAR"], ["place", "VARCHAR"], ["count", "BIGINT"]] as const;
/** One row per timed thing per report: counts per bucket on `bounds_ms` (plus one for longer). */
const TIMING_COLUMNS = [
  ...REPORT_KEY,
  ...ORIGIN,
  ["metric", "VARCHAR"],
  ["bounds_ms", "BIGINT[]"],
  ["buckets", "BIGINT[]"],
  ["count", "BIGINT"],
  ["sum_ms", "BIGINT"],
] as const;
/** One row per feature per report. */
const USAGE_COLUMNS = [...REPORT_KEY, ...ORIGIN, ["feature", "VARCHAR"], ["count", "BIGINT"]] as const;

/** Every table, by its name in the lake. */
const TABLES = {
  "fuwa.signals": SIGNAL_COLUMNS,
  "reports.reports": REPORT_COLUMNS,
  "reports.errors": ERROR_COLUMNS,
  "reports.timings": TIMING_COLUMNS,
  "reports.usage": USAGE_COLUMNS,
} as const satisfies Record<string, Columns>;
export type Table = keyof typeof TABLES;
export type Row = Record<string, unknown>;
/** Rows waiting to be written, by table. */
export type Batch = { readonly [T in Table]?: ReadonlyArray<Row> };

const definition = (columns: Columns) => columns.map(([name, type]) => `${name} ${type}`).join(", ");

/** Totals summed per day over each install's last signal that day. */
const SNAPSHOT_TOTALS = [
  "accounts",
  "accounts_active_1d",
  "accounts_active_30d",
  "servers",
  "members",
  "channels",
  "messages",
  "message_bytes",
  "attachments",
  "attachment_bytes",
  "storage_bytes",
];

const VIEWS = {
  // Each signal once, however many times it was delivered.
  signals_unique: `
    SELECT * FROM signals
    QUALIFY row_number() OVER (PARTITION BY install_id, sent_at ORDER BY received_at) = 1`,
  // Every install as of its latest signal.
  installs: `
    SELECT * EXCLUDE (raw), sent_at AS last_seen FROM signals_unique
    QUALIFY row_number() OVER (PARTITION BY install_id ORDER BY sent_at DESC) = 1`,
  // Each signal with what happened since the install's previous one, from its
  // lifetime counters. An install's first signal counts nothing, and a counter
  // that went backwards (a reset) counts as zero.
  activity: `
    SELECT *,
      greatest(messages_sent - coalesce(lag(messages_sent) OVER previous, messages_sent), 0) AS messages_sent_since,
      greatest(events - coalesce(lag(events) OVER previous, events), 0) AS events_since
    FROM signals_unique
    WINDOW previous AS (PARTITION BY install_id ORDER BY sent_at)`,
  // Per UTC day and kind of hosting: installs that reported, their totals as of
  // each install's last signal that day, and the activity the day's signals cover.
  daily: `
    WITH days AS (
      SELECT *, CAST(sent_at AS DATE) AS day,
        row_number() OVER (PARTITION BY install_id, CAST(sent_at AS DATE) ORDER BY sent_at DESC) = 1 AS latest
      FROM activity
    )
    SELECT
      day,
      hosting,
      count(DISTINCT install_id) AS installs,
      ${SNAPSHOT_TOTALS.map((column) => `sum(${column}) FILTER (latest) AS ${column}`).join(",\n      ")},
      sum(messages_sent_since) AS messages_sent,
      sum(events_since) AS events
    FROM days
    GROUP BY day, hosting`,
} as const;

/** The first delivery of each report, for each report table. */
const REPORT_VIEWS = Object.fromEntries(
  ["reports", "errors", "timings", "usage"].map((table) => [
    `${table}_unique`,
    `SELECT * FROM ${table} QUALIFY dense_rank() OVER (PARTITION BY report_id ORDER BY received_at) = 1`,
  ]),
);

/** Creates whatever is missing. Safe to run on every start, from any number of instances. */
export const migrate = Effect.gen(function* () {
  const lake = yield* Lake;
  const existing = yield* lake.query(
    "SELECT schema_name || '.' || table_name AS name FROM duckdb_tables() WHERE database_name = 'lake'",
  );

  yield* lake.run("CREATE SCHEMA IF NOT EXISTS lake.fuwa");
  yield* lake.run("CREATE SCHEMA IF NOT EXISTS lake.reports");
  for (const [table, columns] of Object.entries(TABLES)) {
    if (existing.some((row) => row.name === table)) continue;
    yield* lake.transaction([
      [`CREATE TABLE IF NOT EXISTS lake.${table} (${definition(columns)})`],
      // Monthly files, so reading a date range skips the rest.
      [`ALTER TABLE lake.${table} SET PARTITIONED BY (year(sent_at), month(sent_at))`],
    ]);
  }
  yield* lake.transaction([
    ...Object.entries(VIEWS).map(([name, sql]) => [`CREATE OR REPLACE VIEW lake.fuwa.${name} AS ${sql}`] as const),
    ...Object.entries(REPORT_VIEWS).map(([name, sql]) => [`CREATE OR REPLACE VIEW lake.reports.${name} AS ${sql}`] as const),
  ]);
});

/** A signal as a table row. Fields beyond the known ones only go into `raw`. */
export const toRow = (signal: Signal, receivedAt: Date): SignalRow => {
  const { config, totals } = signal;
  return {
    received_at: receivedAt.toISOString(),
    sent_at: new Date(signal.sent_at).toISOString(),
    schema_id: signal.schema,
    install_id: signal.install_id,
    hosting: signal.hosting,
    version: signal.version,
    os: signal.os,
    arch: signal.arch,
    uptime_seconds: signal.uptime_seconds,
    local_accounts: config.local_accounts,
    linked_accounts: config.linked_accounts,
    server_creation: config.server_creation,
    encryption: config.encryption,
    limits_configured: config.limits_configured,
    accounts: totals.accounts,
    accounts_active_1d: totals.accounts_active_1d,
    accounts_active_30d: totals.accounts_active_30d,
    servers: totals.servers,
    discoverable_servers: totals.discoverable_servers,
    members: totals.members,
    channels: totals.channels,
    messages: totals.messages,
    messages_sent: totals.messages_sent,
    message_bytes: totals.message_bytes,
    attachments: totals.attachments,
    attachment_bytes: totals.attachment_bytes,
    events: totals.events,
    storage_bytes: totals.storage_bytes,
    raw: signal,
  };
};

/** A report as table rows: one for the report, and one per entry. Fields beyond the known ones only go into `raw`, while small. */
export const reportRows = (report: Report, receivedAt: Date): Batch => {
  const key = {
    received_at: receivedAt.toISOString(),
    sent_at: new Date(report.sent_at).toISOString(),
    source: sourceOf(report),
    report_id: report.report_id,
    install_id: report.install_id ?? null,
    hosting: report.hosting,
    part: report.part,
  };
  const origin = (entry: { app: string; version: string; platform: string; os: string }) => ({
    app: entry.app,
    version: entry.version,
    platform: entry.platform,
    os: entry.os,
  });
  return {
    "reports.reports": [
      { ...key, schema_id: report.schema, since: new Date(report.since).toISOString(), dropped: report.dropped, raw: extrasOf(report) },
    ],
    "reports.errors": report.errors.map((e) => ({ ...key, ...origin(e), kind: e.kind, place: e.place, count: e.count })),
    "reports.timings": report.timings.map((t) => ({
      ...key,
      ...origin(t),
      metric: t.metric,
      bounds_ms: report.bounds_ms,
      buckets: t.buckets,
      count: t.count,
      sum_ms: t.sum_ms,
    })),
    "reports.usage": report.usage.map((u) => ({ ...key, ...origin(u), feature: u.feature, count: u.count })),
  };
};

/** Writes the rows, every table's, as one lake snapshot. */
export const append = (batch: Batch) =>
  Effect.gen(function* () {
    // Each table's rows go in as one JSON parameter, cast to its columns.
    const inserts = (Object.entries(batch) as Array<[Table, ReadonlyArray<Row>]>)
      .filter(([, rows]) => rows.length > 0)
      .map(
        ([table, rows]): [string, DuckDBValue[]] => [
          // Struct fields become columns; lists (a timing's buckets) stay lists.
          `INSERT INTO lake.${table} BY NAME SELECT unnest(row) FROM (SELECT unnest($1::JSON::STRUCT(${definition(TABLES[table])})[]) AS row)`,
          [JSON.stringify(rows)],
        ],
      );
    if (inserts.length === 0) return;
    const lake = yield* Lake;
    yield* lake.transaction(inserts);
  });
