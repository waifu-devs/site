import type { StorageAdapter } from "@openauthjs/openauth/storage/storage";
import { joinKey, splitKey } from "@openauthjs/openauth/storage/storage";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { Effect, Runtime } from "effect";
import { Db } from "./Db.ts";
import { openauthStorage as store } from "./schema.ts";

const live = or(isNull(store.expiresAt), gt(store.expiresAt, sql`now()`));

/**
 * OpenAuth's storage (signing keys, auth codes, refresh tokens) in the
 * `openauth_storage` table. OpenAuth wants promises, so each call runs an
 * Effect on the runtime it is given.
 */
export const makeStorage = Effect.gen(function* () {
  const db = yield* Db;
  const run = Runtime.runPromise(yield* Effect.runtime<never>());

  const adapter: StorageAdapter = {
    get: (key) =>
      run(
        db
          .select({ value: store.value })
          .from(store)
          .where(and(eq(store.key, joinKey(key)), live))
          .pipe(Effect.map((rows) => rows[0]?.value)),
      ),
    set: (key, value, expiry) =>
      run(
        Effect.gen(function* () {
          yield* db
            .insert(store)
            .values({ key: joinKey(key), value, expiresAt: expiry ?? null })
            .onConflictDoUpdate({ target: store.key, set: { value, expiresAt: expiry ?? null } });
          // Sweep expired codes and used refresh tokens so the table doesn't grow forever.
          yield* db.delete(store).where(lt(store.expiresAt, sql`now()`));
        }),
      ),
    remove: (key) => run(db.delete(store).where(eq(store.key, joinKey(key))).pipe(Effect.asVoid)),
    async *scan(prefix) {
      // Keys are joined with \x1f, so a prefix scan is "starts with prefix + \x1f".
      const start = joinKey([...prefix, ""]);
      const rows = await run(db.select().from(store).where(and(sql`starts_with(${store.key}, ${start})`, live)));
      for (const row of rows) yield [splitKey(row.key), row.value];
    },
  };
  return adapter;
});

/** Deletes a refresh token (`<subject>:<token>`) so it can't mint new access tokens. */
export const revokeRefreshToken = (refresh: string) =>
  Effect.gen(function* () {
    const split = refresh.lastIndexOf(":");
    if (split < 0) return;
    const db = yield* Db;
    yield* db.delete(store).where(eq(store.key, joinKey(["oauth:refresh", refresh.slice(0, split), refresh.slice(split + 1)])));
  });
