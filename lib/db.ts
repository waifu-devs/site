import { env } from "cloudflare:workers";
import { BUILTIN_THEMES, DEFAULT_THEME, parseColors, type Theme } from "./themes";

export type User = {
  id: string;
  github_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  pronouns: string | null;
  website: string | null;
  favorite_waifu: string | null;
  theme_id: string;
  created_at: number;
  updated_at: number;
};

type ThemeRow = {
  id: string;
  owner_id: string;
  owner_username: string;
  name: string;
  description: string | null;
  colors: string;
  is_public: number;
  created_at: number;
};

export function db(): D1Database {
  return env.DB;
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function getUserByUsername(username: string): Promise<User | null> {
  return db().prepare("SELECT * FROM users WHERE username = ?").bind(username).first<User>();
}

export async function listMembers(limit = 60): Promise<User[]> {
  const { results } = await db()
    .prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all<User>();
  return results;
}

export async function countMembers(): Promise<number> {
  const row = await db().prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  return row?.n ?? 0;
}

/** Creates the user on first login, otherwise refreshes the GitHub-owned fields. */
export async function upsertGithubUser(gh: {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}): Promise<User> {
  // GitHub logins can be renamed and later reclaimed by someone else. Free the
  // login from any stale account so the UNIQUE constraint doesn't block sign-in.
  await db()
    .prepare("UPDATE users SET username = username || '-' || github_id WHERE username = ? AND github_id != ?")
    .bind(gh.login, gh.id)
    .run();

  const existing = await db()
    .prepare("SELECT * FROM users WHERE github_id = ?")
    .bind(gh.id)
    .first<User>();

  if (existing) {
    await db()
      .prepare("UPDATE users SET username = ?, avatar_url = ?, updated_at = unixepoch() WHERE id = ?")
      .bind(gh.login, gh.avatar_url, existing.id)
      .run();
    return { ...existing, username: gh.login, avatar_url: gh.avatar_url };
  }

  const id = newId();
  await db()
    .prepare(
      "INSERT INTO users (id, github_id, username, display_name, avatar_url) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, gh.id, gh.login, gh.name, gh.avatar_url)
    .run();
  return (await db().prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>())!;
}

function rowToTheme(row: ThemeRow): Theme {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    colors: parseColors(JSON.parse(row.colors)) ?? DEFAULT_THEME.colors,
    builtin: false,
    isPublic: row.is_public === 1,
    ownerUsername: row.owner_username,
  };
}

const THEME_SELECT =
  "SELECT themes.*, users.username AS owner_username FROM themes JOIN users ON users.id = themes.owner_id";

export async function getTheme(id: string | null | undefined): Promise<Theme> {
  if (!id) return DEFAULT_THEME;
  const builtin = BUILTIN_THEMES.find((t) => t.id === id);
  if (builtin) return builtin;
  const row = await db().prepare(`${THEME_SELECT} WHERE themes.id = ?`).bind(id).first<ThemeRow>();
  return row ? rowToTheme(row) : DEFAULT_THEME;
}

export async function listCommunityThemes(limit = 48): Promise<Theme[]> {
  const { results } = await db()
    .prepare(`${THEME_SELECT} WHERE themes.is_public = 1 ORDER BY themes.created_at DESC LIMIT ?`)
    .bind(limit)
    .all<ThemeRow>();
  return results.map(rowToTheme);
}

export async function listThemesByOwner(ownerId: string): Promise<Theme[]> {
  const { results } = await db()
    .prepare(`${THEME_SELECT} WHERE themes.owner_id = ? ORDER BY themes.created_at DESC`)
    .bind(ownerId)
    .all<ThemeRow>();
  return results.map(rowToTheme);
}

/** A user may wear any built-in theme, any public theme, or their own private ones. */
export async function canUseTheme(userId: string, themeId: string): Promise<boolean> {
  if (BUILTIN_THEMES.some((t) => t.id === themeId)) return true;
  const row = await db()
    .prepare("SELECT 1 FROM themes WHERE id = ? AND (is_public = 1 OR owner_id = ?)")
    .bind(themeId, userId)
    .first();
  return row !== null;
}
