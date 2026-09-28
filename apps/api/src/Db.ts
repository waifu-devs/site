import * as PgDrizzle from "@effect/sql-drizzle/Pg";
import { PgClient } from "@effect/sql-pg";
import { Config, Effect, Layer } from "effect";
import * as schema from "./schema.ts";

/** Postgres connection pool, from DATABASE_URL (Railway's Postgres in production). */
export const PgLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
  maxConnections: Config.integer("DATABASE_POOL_SIZE").pipe(Config.withDefault(10)),
});

/** Drizzle, running its queries through the Effect SQL client (so they are Effects). */
export class Db extends Effect.Service<Db>()("Db", {
  effect: PgDrizzle.make({ schema, casing: "snake_case" }),
}) {}

export const DbLive = Db.Default.pipe(Layer.provideMerge(PgLive));
