/**
 * The lake's table and views, all in the `fuwa` schema of the DuckLake. Rows
 * are append-only; a signal delivered twice lands twice, so the views count
 * each (install_id, sent_at) once.
 */
import type { DuckDBValue } from "@duckdb/node-api";
import { Effect } from "effect";
import { Lake } from "./Lake.ts";
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

/** Creates whatever is missing. Safe to run on every start, from any number of instances. */
export const migrate = Effect.gen(function* () {
  const lake = yield* Lake;
  const existing = yield* lake.query(
    "SELECT table_name FROM duckdb_tables() WHERE database_name = 'lake' AND schema_name = 'fuwa'",
  );

  yield* lake.run("CREATE SCHEMA IF NOT EXISTS lake.fuwa");
  if (!existing.some((row) => row.table_name === "signals")) {
    yield* lake.transaction([
      [`CREATE TABLE IF NOT EXISTS lake.fuwa.signals (${definition(SIGNAL_COLUMNS)})`],
      // Monthly files, so reading a date range skips the rest.
      ["ALTER TABLE lake.fuwa.signals SET PARTITIONED BY (year(sent_at), month(sent_at))"],
    ]);
  }
  yield* lake.transaction(Object.entries(VIEWS).map(([name, sql]) => [`CREATE OR REPLACE VIEW lake.fuwa.${name} AS ${sql}`] as const));
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

/** Writes the rows as one lake snapshot. */
export const append = (rows: ReadonlyArray<SignalRow>) =>
  Effect.gen(function* () {
    if (rows.length === 0) return;
    const lake = yield* Lake;
    // The rows go in as one JSON parameter, cast to the table's columns.
    const insert: [string, DuckDBValue[]] = [
      `INSERT INTO lake.fuwa.signals BY NAME SELECT unnest($1::JSON::STRUCT(${definition(SIGNAL_COLUMNS)})[], recursive := true)`,
      [JSON.stringify(rows)],
    ];
    yield* lake.transaction([insert]);
  });
