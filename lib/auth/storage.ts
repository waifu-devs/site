import type { StorageAdapter } from "@openauthjs/openauth/storage/storage";
import { joinKey, splitKey } from "@openauthjs/openauth/storage/storage";
import type { Sql } from "postgres";

/** OpenAuth storage backed by the site's Postgres database (table `openauth_storage`). */
export function PostgresStorage(sql: Sql): StorageAdapter {
  return {
    async get(key) {
      const [row] = await sql<{ value: Record<string, unknown> }[]>`
        SELECT value FROM openauth_storage
        WHERE key = ${joinKey(key)} AND (expires_at IS NULL OR expires_at > now())`;
      return row?.value;
    },
    async set(key, value, expiry) {
      const k = joinKey(key);
      // Sweeps expired codes and used refresh tokens in the same round trip, so
      // the table doesn't grow forever. (Skips `k` so no row is touched twice.)
      await sql`
        WITH swept AS (DELETE FROM openauth_storage WHERE expires_at < now() AND key <> ${k})
        INSERT INTO openauth_storage (key, value, expires_at)
        VALUES (${k}, ${sql.json(value as never)}, ${expiry ?? null})
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`;
    },
    async remove(key) {
      await sql`DELETE FROM openauth_storage WHERE key = ${joinKey(key)}`;
    },
    async *scan(prefix) {
      // Keys are joined with \x1f, so a prefix scan is "starts with prefix + \x1f".
      const start = joinKey([...prefix, ""]);
      const rows = await sql<{ key: string; value: Record<string, unknown> }[]>`
        SELECT key, value FROM openauth_storage
        WHERE starts_with(key, ${start}) AND (expires_at IS NULL OR expires_at > now())`;
      for (const row of rows) yield [splitKey(row.key), row.value];
    },
  };
}

/** Deletes a refresh token (`<subject>:<token>`) so it can't mint new access tokens. */
export async function revokeRefreshToken(sql: Sql, refresh: string): Promise<void> {
  const split = refresh.lastIndexOf(":");
  if (split < 0) return;
  const key = joinKey(["oauth:refresh", refresh.slice(0, split), refresh.slice(split + 1)]);
  await sql`DELETE FROM openauth_storage WHERE key = ${key}`;
}
