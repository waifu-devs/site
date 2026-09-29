/**
 * Runs SQL against the lake, read-only, and prints the rows. The `fuwa` schema
 * is the default, so `FROM daily` works. On Railway, where the lake is reachable:
 *
 *   railway ssh --service analytics
 *   node apps/analytics/dist/sql.js "FROM daily ORDER BY day DESC LIMIT 14"
 */
import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { makeLake } from "./Lake.ts";

const sql = process.argv.slice(2).join(" ").trim();

const program = Effect.gen(function* () {
  if (!sql) return yield* Console.error('Usage: sql "<query>"   e.g. sql "FROM daily ORDER BY day DESC"');
  const lake = yield* makeLake({ readOnly: true });
  yield* lake.run("USE lake.fuwa");
  const rows = yield* lake.query(sql);
  yield* Console.table(rows);
}).pipe(Effect.scoped);

NodeRuntime.runMain(program);
