import { env } from "cloudflare:workers";
import postgres from "postgres";
import { cache } from "react";
import { BUILTIN_THEMES, DEFAULT_THEME, parseVariant, type Theme } from "./themes";

export type User = {
  id: string;
  github_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  pronouns: string | null;
  website: string | null;
  favorite_waifu: string | null;
  theme_id: string;
  created_at: Date;
  updated_at: Date;
};

type ThemeRow = {
  id: string;
  owner_id: string;
  owner_username: string;
  name: string;
  description: string | null;
  variant: unknown;
  is_public: boolean;
  created_at: Date;
};

/**
 * One Postgres client per request, over Hyperdrive. Workers can't share
 * sockets between requests, and Hyperdrive keeps the real connections to
 * PlanetScale warm, so a fresh client per request is cheap.
 */
export const db = cache(() =>
  postgres(env.HYPERDRIVE.connectionString, {
    // These are connections to Hyperdrive, not to PlanetScale; Hyperdrive's own
    // origin pool is what the (small) database sees. Keep this low anyway.
    max: 3,
    // Skips a round trip on connect; we don't use custom array types.
    fetch_types: false,
  }),
);

export async function getUserByUsername(username: string): Promise<User | null> {
  const [user] = await db()<User[]>`SELECT * FROM users WHERE lower(username) = lower(${username})`;
  return user ?? null;
}

export async function listMembers(limit = 60): Promise<User[]> {
  return db()<User[]>`SELECT * FROM users ORDER BY created_at DESC LIMIT ${limit}`;
}

export async function countMembers(): Promise<number> {
  const [row] = await db()<{ n: number }[]>`SELECT count(*)::int AS n FROM users`;
  return row?.n ?? 0;
}

/** Creates the user on first login, otherwise refreshes the GitHub-owned fields. */
export async function upsertGithubUser(gh: {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}): Promise<User> {
  return db().begin(async (sql) => {
    // GitHub logins can be renamed and later reclaimed by someone else. Free the
    // login from any stale account so the unique index doesn't block sign-in.
    await sql`
      UPDATE users SET username = username || '-' || github_id
      WHERE lower(username) = lower(${gh.login}) AND github_id <> ${gh.id}`;
    const [user] = await sql<User[]>`
      INSERT INTO users (github_id, username, display_name, avatar_url)
      VALUES (${gh.id}, ${gh.login}, ${gh.name}, ${gh.avatar_url})
      ON CONFLICT (github_id) DO UPDATE
        SET username = excluded.username, avatar_url = excluded.avatar_url, updated_at = now()
      RETURNING *`;
    return user;
  });
}

function rowToTheme(row: ThemeRow): Theme {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    variant: parseVariant(row.variant) ?? DEFAULT_THEME.variant,
    builtin: false,
    isPublic: row.is_public,
    ownerUsername: row.owner_username,
  };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTheme(id: string | null | undefined): Promise<Theme> {
  if (!id) return DEFAULT_THEME;
  const builtin = BUILTIN_THEMES.find((t) => t.id === id);
  if (builtin) return builtin;
  if (!UUID.test(id)) return DEFAULT_THEME;
  const [row] = await db()<ThemeRow[]>`
    SELECT themes.*, users.username AS owner_username
    FROM themes JOIN users ON users.id = themes.owner_id
    WHERE themes.id = ${id}`;
  return row ? rowToTheme(row) : DEFAULT_THEME;
}

export async function listCommunityThemes(limit = 48): Promise<Theme[]> {
  const rows = await db()<ThemeRow[]>`
    SELECT themes.*, users.username AS owner_username
    FROM themes JOIN users ON users.id = themes.owner_id
    WHERE themes.is_public
    ORDER BY themes.created_at DESC LIMIT ${limit}`;
  return rows.map(rowToTheme);
}

export async function listThemesByOwner(ownerId: string): Promise<Theme[]> {
  const rows = await db()<ThemeRow[]>`
    SELECT themes.*, users.username AS owner_username
    FROM themes JOIN users ON users.id = themes.owner_id
    WHERE themes.owner_id = ${ownerId}
    ORDER BY themes.created_at DESC`;
  return rows.map(rowToTheme);
}

/** A user may wear any built-in theme, any public theme, or their own private ones. */
export async function canUseTheme(userId: string, themeId: string): Promise<boolean> {
  if (BUILTIN_THEMES.some((t) => t.id === themeId)) return true;
  if (!UUID.test(themeId)) return false;
  const rows = await db()`SELECT 1 FROM themes WHERE id = ${themeId} AND (is_public OR owner_id = ${userId})`;
  return rows.length > 0;
}
