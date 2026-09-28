import { sql } from "drizzle-orm";
import { bigint, boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ThemeVariant } from "@waifu-devs/domain/api";

// Column names are derived from the keys in snake_case (see `casing` in src/Db.ts
// and drizzle.config.ts). Change this file, then `pnpm db:generate` a migration.

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/**
 * Users are created on first GitHub login. githubId is the stable identity;
 * username tracks the GitHub login and is refreshed on every sign-in.
 */
export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    githubId: bigint({ mode: "number" }).notNull().unique("users_github_id_unique"),
    username: text().notNull(),
    displayName: text(),
    avatarUrl: text(),
    bio: text(),
    pronouns: text(),
    website: text(),
    favoriteWaifu: text(),
    themeId: text().notNull().default("sakura"),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // GitHub logins are case-insensitive.
  (t) => [uniqueIndex("users_username_lower").on(sql`lower(${t.username})`)],
);

/** Community-made themes. Built-in themes live in code (lib/themes.ts). */
export const themes = pgTable(
  "themes",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    variant: jsonb().$type<ThemeVariant>().notNull(),
    isPublic: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("themes_owner_id").on(t.ownerId),
    index("themes_public_created").on(t.createdAt.desc()).where(sql`${t.isPublic}`),
  ],
);

/** OpenAuth's storage: signing keys, authorization codes and refresh tokens. */
export const openauthStorage = pgTable(
  "openauth_storage",
  {
    key: text().primaryKey(),
    value: jsonb().$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("openauth_storage_expires_at").on(t.expiresAt).where(sql`${t.expiresAt} IS NOT NULL`)],
);
