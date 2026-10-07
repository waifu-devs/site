import { Effect, Schema } from "effect";
import { Summary } from "./Api.ts";
import { Lake } from "./Lake.ts";

const DAY_COLUMNS = [
  "installs",
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
  "messages_sent",
  "events",
];

/** The last `days` UTC days of the `daily` view, and which versions installs run. */
export const summary = (days: number) =>
  Effect.gen(function* () {
    const lake = yield* Lake;
    const daily = yield* lake.query(
      `SELECT CAST(day AS VARCHAR) AS day, hosting, ${DAY_COLUMNS.map((column) => `coalesce(${column}, 0)::DOUBLE AS ${column}`).join(", ")}, agents::DOUBLE AS agents
       FROM lake.fuwa.daily
       WHERE day > current_date - CAST($1 AS INTEGER)
       ORDER BY day DESC, hosting`,
      [days],
    );
    const versions = yield* lake.query(
      `SELECT version, hosting, count(*)::DOUBLE AS installs
       FROM lake.fuwa.installs
       WHERE last_seen > now() - INTERVAL 7 DAYS
       GROUP BY version, hosting
       ORDER BY installs DESC, version DESC, hosting`,
    );
    return yield* Schema.decodeUnknown(Summary)({ days: daily, versions });
  });
