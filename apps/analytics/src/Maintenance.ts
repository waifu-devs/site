import { Config, Effect, Layer, Schedule } from "effect";
import { Lake } from "./Lake.ts";

/**
 * Once a day, compacts the lake: CHECKPOINT moves rows DuckLake kept inline in
 * the Postgres catalog into Parquet files, merges small files, expires
 * snapshots older than 30 days and deletes the files nothing references anymore.
 */
export const MaintenanceLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    const lake = yield* Lake;
    const cron = yield* Config.string("LAKE_MAINTENANCE_CRON").pipe(Config.withDefault("0 4 * * *"));

    yield* lake.run("CALL lake.set_option('expire_older_than', '30 days')");
    yield* lake.run("CALL lake.set_option('delete_older_than', '7 days')");

    yield* lake.run("CHECKPOINT lake").pipe(
      Effect.tap(() => Effect.logInfo("Compacted the lake")),
      Effect.catchAll((error) => Effect.logWarning("Compacting the lake failed", error)),
      Effect.schedule(Schedule.cron(cron)),
      Effect.forkScoped,
    );
  }),
);
