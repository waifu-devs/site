import type { StorageAdapter } from "@openauthjs/openauth/storage/storage";
import { joinKey, splitKey } from "@openauthjs/openauth/storage/storage";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { openauthStorage as store } from "../schema";

const live = or(isNull(store.expiresAt), gt(store.expiresAt, sql`now()`));

/** OpenAuth storage backed by the site's Postgres database (table `openauth_storage`). */
export function PostgresStorage(db: Db): StorageAdapter {
  return {
    async get(key) {
      const [row] = await db
        .select({ value: store.value })
        .from(store)
        .where(and(eq(store.key, joinKey(key)), live));
      return row?.value;
    },
    async set(key, value, expiry) {
      await db
        .insert(store)
        .values({ key: joinKey(key), value, expiresAt: expiry ?? null })
        .onConflictDoUpdate({ target: store.key, set: { value, expiresAt: expiry ?? null } });
      // Sweep expired codes and used refresh tokens so the table doesn't grow forever.
      await db.delete(store).where(lt(store.expiresAt, sql`now()`));
    },
    async remove(key) {
      await db.delete(store).where(eq(store.key, joinKey(key)));
    },
    async *scan(prefix) {
      // Keys are joined with \x1f, so a prefix scan is "starts with prefix + \x1f".
      const start = joinKey([...prefix, ""]);
      const rows = await db
        .select()
        .from(store)
        .where(and(sql`starts_with(${store.key}, ${start})`, live));
      for (const row of rows) yield [splitKey(row.key), row.value];
    },
  };
}

/** Deletes a refresh token (`<subject>:<token>`) so it can't mint new access tokens. */
export async function revokeRefreshToken(db: Db, refresh: string): Promise<void> {
  const split = refresh.lastIndexOf(":");
  if (split < 0) return;
  const key = joinKey(["oauth:refresh", refresh.slice(0, split), refresh.slice(split + 1)]);
  await db.delete(store).where(eq(store.key, key));
}
