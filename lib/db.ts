import { env } from "cloudflare:workers";
import { and, desc, eq, getTableColumns, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { cache } from "react";
import * as schema from "./schema";
import { themes, users } from "./schema";
import { BUILTIN_THEMES, DEFAULT_THEME, parseVariant, type Theme } from "./themes";

export type User = typeof users.$inferSelect;

/** A Drizzle client over its own postgres.js connection pool. */
export function connect(url: string, max = 3) {
  return drizzle({
    // fetch_types skips a round trip on connect; we don't use custom array types.
    client: postgres(url, { max, fetch_types: false }),
    schema,
    casing: "snake_case",
  });
}
export type Db = ReturnType<typeof connect>;

/**
 * One client per request, over Hyperdrive. Workers can't share sockets between
 * requests, and Hyperdrive keeps the real connections to PlanetScale warm, so a
 * fresh client per request is cheap. `max` counts connections to Hyperdrive, not
 * to PlanetScale; Hyperdrive's own origin pool is what the (small) database sees.
 */
export const db = cache(() => connect(env.HYPERDRIVE.connectionString));

export async function getUserByUsername(username: string): Promise<User | null> {
  const [user] = await db().select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
  return user ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db().select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function listMembers(limit = 60): Promise<User[]> {
  return db().select().from(users).orderBy(desc(users.createdAt)).limit(limit);
}

export async function countMembers(): Promise<number> {
  return db().$count(users);
}

/**
 * Creates the user on first login, otherwise refreshes the GitHub-owned fields.
 * Takes its own client because it runs in the OpenAuth issuer, outside a render.
 */
export async function upsertGithubUser(
  client: Db,
  gh: { id: number; login: string; name: string | null; avatar_url: string },
): Promise<User> {
  return client.transaction(async (tx) => {
    // GitHub logins can be renamed and later reclaimed by someone else. Free the
    // login from any stale account so the unique index doesn't block sign-in.
    await tx
      .update(users)
      .set({ username: sql`${users.username} || '-' || ${users.githubId}` })
      .where(and(sql`lower(${users.username}) = lower(${gh.login})`, ne(users.githubId, gh.id)));
    const [user] = await tx
      .insert(users)
      .values({ githubId: gh.id, username: gh.login, displayName: gh.name, avatarUrl: gh.avatar_url })
      .onConflictDoUpdate({
        target: users.githubId,
        set: { username: gh.login, avatarUrl: gh.avatar_url, updatedAt: sql`now()` },
      })
      .returning();
    return user;
  });
}

type ThemeRow = typeof themes.$inferSelect & { ownerUsername: string };

/** Theme columns plus the owner's username. */
function selectThemes() {
  return db()
    .select({ ...getTableColumns(themes), ownerUsername: users.username })
    .from(themes)
    .innerJoin(users, eq(users.id, themes.ownerId));
}

function rowToTheme(row: ThemeRow): Theme {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    variant: parseVariant(row.variant) ?? DEFAULT_THEME.variant,
    builtin: false,
    isPublic: row.isPublic,
    ownerUsername: row.ownerUsername,
  };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTheme(id: string | null | undefined): Promise<Theme> {
  if (!id) return DEFAULT_THEME;
  const builtin = BUILTIN_THEMES.find((t) => t.id === id);
  if (builtin) return builtin;
  if (!UUID.test(id)) return DEFAULT_THEME;
  const [row] = await selectThemes().where(eq(themes.id, id));
  return row ? rowToTheme(row) : DEFAULT_THEME;
}

export async function listCommunityThemes(limit = 48): Promise<Theme[]> {
  const rows = await selectThemes().where(eq(themes.isPublic, true)).orderBy(desc(themes.createdAt)).limit(limit);
  return rows.map(rowToTheme);
}

export async function listThemesByOwner(ownerId: string): Promise<Theme[]> {
  const rows = await selectThemes().where(eq(themes.ownerId, ownerId)).orderBy(desc(themes.createdAt));
  return rows.map(rowToTheme);
}

/** A user may wear any built-in theme, any public theme, or their own private ones. */
export async function canUseTheme(userId: string, themeId: string): Promise<boolean> {
  if (BUILTIN_THEMES.some((t) => t.id === themeId)) return true;
  if (!UUID.test(themeId)) return false;
  const n = await db().$count(themes, and(eq(themes.id, themeId), or(eq(themes.isPublic, true), eq(themes.ownerId, userId))));
  return n > 0;
}
