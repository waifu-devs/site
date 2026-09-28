/**
 * The lake's tables and views, all in the `fuwa` schema of the DuckLake. Rows
 * are append-only; a retried batch can land twice, so the views count each
 * event id once.
 */
import type { DuckDBValue } from "@duckdb/node-api";
import { Effect } from "effect";
import { Lake } from "./Lake.ts";
import { type Batch, isHeartbeat } from "./Signals.ts";

/** Columns every row carries: the event, when it arrived, and who sent it. */
const ENVELOPE = [
  ["event_id", "UUID"],
  ["received_at", "TIMESTAMPTZ"],
  ["recorded_at", "TIMESTAMPTZ"],
  ["schema_version", "INTEGER"],
  ["install_id", "UUID"],
  ["version", "VARCHAR"],
  ["os", "VARCHAR"],
  ["arch", "VARCHAR"],
  ["hosting", "VARCHAR"],
] as const;

/** One row per heartbeat. New columns go at the end (and into `migrate`). */
const HEARTBEAT_COLUMNS = [
  ...ENVELOPE,
  ["uptime_seconds", "BIGINT"],
  ["period_seconds", "BIGINT"],
  ["standalone_accounts", "BOOLEAN"],
  ["linked_accounts", "BOOLEAN"],
  ["signups", "VARCHAR"],
  ["servers", "BIGINT"],
  ["channels", "BIGINT"],
  ["members", "BIGINT"],
  ["accounts_standalone", "BIGINT"],
  ["accounts_linked", "BIGINT"],
  ["messages", "BIGINT"],
  ["storage_bytes", "BIGINT"],
  ["upload_bytes", "BIGINT"],
  ["period_messages", "BIGINT"],
  ["period_active_accounts", "BIGINT"],
  ["period_new_accounts", "BIGINT"],
  ["period_new_servers", "BIGINT"],
] as const;

/** Event types this ingest doesn't know yet, kept whole. */
const EVENT_COLUMNS = [...ENVELOPE, ["type", "VARCHAR"], ["payload", "JSON"]] as const;

type Columns = ReadonlyArray<readonly [name: string, type: string]>;
type Row<C extends Columns> = { [K in C[number] as K[0]]: unknown };
export type HeartbeatRow = Row<typeof HEARTBEAT_COLUMNS>;
export type EventRow = Row<typeof EVENT_COLUMNS>;

const definition = (columns: Columns) => columns.map(([name, type]) => `${name} ${type}`).join(", ");

const VIEWS = {
  // Each heartbeat once, however many times it was delivered.
  heartbeats_unique: `
    SELECT * FROM heartbeats
    QUALIFY row_number() OVER (PARTITION BY event_id ORDER BY received_at) = 1`,
  // Each event of another type once.
  events_unique: `
    SELECT * FROM events
    QUALIFY row_number() OVER (PARTITION BY event_id ORDER BY received_at) = 1`,
  // Every install as of its latest heartbeat.
  installs: `
    SELECT * EXCLUDE (event_id), recorded_at AS last_seen FROM heartbeats_unique
    QUALIFY row_number() OVER (PARTITION BY install_id ORDER BY recorded_at DESC) = 1`,
  // Per UTC day and kind of hosting: installs that reported, their totals as of
  // each install's last heartbeat that day, and what happened during the day.
  daily: `
    WITH days AS (
      SELECT *, CAST(recorded_at AS DATE) AS day,
        row_number() OVER (PARTITION BY install_id, CAST(recorded_at AS DATE) ORDER BY recorded_at DESC) = 1 AS latest
      FROM heartbeats_unique
    )
    SELECT
      day,
      hosting,
      count(DISTINCT install_id) AS installs,
      sum(servers) FILTER (latest) AS servers,
      sum(channels) FILTER (latest) AS channels,
      sum(members) FILTER (latest) AS members,
      sum(accounts_standalone + accounts_linked) FILTER (latest) AS accounts,
      sum(messages) FILTER (latest) AS messages,
      sum(storage_bytes) FILTER (latest) AS storage_bytes,
      sum(upload_bytes) FILTER (latest) AS upload_bytes,
      sum(period_messages) AS messages_sent,
      sum(period_new_accounts) AS new_accounts,
      sum(period_new_servers) AS new_servers
    FROM days
    GROUP BY day, hosting`,
} as const;

/** Creates whatever is missing. Safe to run on every start, from any number of instances. */
export const migrate = Effect.gen(function* () {
  const lake = yield* Lake;
  const existing = yield* lake.query(
    "SELECT table_name FROM duckdb_tables() WHERE database_name = 'lake' AND schema_name = 'fuwa'",
  );
  const has = (table: string) => existing.some((row) => row.table_name === table);

  yield* lake.run("CREATE SCHEMA IF NOT EXISTS lake.fuwa");
  if (!has("heartbeats")) {
    yield* lake.transaction([
      [`CREATE TABLE IF NOT EXISTS lake.fuwa.heartbeats (${definition(HEARTBEAT_COLUMNS)})`],
      // Monthly files, so reading a date range skips the rest.
      ["ALTER TABLE lake.fuwa.heartbeats SET PARTITIONED BY (year(recorded_at), month(recorded_at))"],
    ]);
  }
  if (!has("events")) {
    yield* lake.transaction([
      [`CREATE TABLE IF NOT EXISTS lake.fuwa.events (${definition(EVENT_COLUMNS)})`],
      ["ALTER TABLE lake.fuwa.events SET PARTITIONED BY (year(recorded_at), month(recorded_at))"],
    ]);
  }
  yield* lake.transaction(Object.entries(VIEWS).map(([name, sql]) => [`CREATE OR REPLACE VIEW lake.fuwa.${name} AS ${sql}`] as const));
});

/** A batch as table rows. */
export const toRows = (batch: Batch, receivedAt: Date) => {
  const heartbeats: HeartbeatRow[] = [];
  const events: EventRow[] = [];
  for (const event of batch.events) {
    const envelope = {
      event_id: event.id,
      received_at: receivedAt.toISOString(),
      recorded_at: event.at.toISOString(),
      schema_version: batch.schema,
      install_id: batch.install.id,
      version: batch.install.version,
      os: batch.install.os,
      arch: batch.install.arch,
      hosting: batch.install.hosting,
    };
    if (isHeartbeat(event)) {
      heartbeats.push({
        ...envelope,
        uptime_seconds: event.uptime_seconds,
        period_seconds: event.period_seconds,
        standalone_accounts: event.config.standalone_accounts,
        linked_accounts: event.config.linked_accounts,
        signups: event.config.signups,
        ...event.totals,
        period_messages: event.period.messages,
        period_active_accounts: event.period.active_accounts,
        period_new_accounts: event.period.new_accounts,
        period_new_servers: event.period.new_servers,
      });
    } else {
      const { id: _id, type, at: _at, ...payload } = event;
      events.push({ ...envelope, type, payload });
    }
  }
  return { heartbeats, events };
};

// The rows go in as one JSON parameter, cast to the table's columns.
const insert = (table: string, columns: Columns, rows: ReadonlyArray<object>): [string, DuckDBValue[]] => [
  `INSERT INTO lake.fuwa.${table} BY NAME SELECT unnest($1::JSON::STRUCT(${definition(columns)})[], recursive := true)`,
  [JSON.stringify(rows)],
];

/** Writes the rows as one lake snapshot. */
export const append = (rows: { heartbeats: ReadonlyArray<HeartbeatRow>; events: ReadonlyArray<EventRow> }) =>
  Effect.gen(function* () {
    const lake = yield* Lake;
    const statements = [];
    if (rows.heartbeats.length > 0) statements.push(insert("heartbeats", HEARTBEAT_COLUMNS, rows.heartbeats));
    if (rows.events.length > 0) statements.push(insert("events", EVENT_COLUMNS, rows.events));
    if (statements.length > 0) yield* lake.transaction(statements);
  });
