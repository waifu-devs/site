import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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

/**
 * News: link and text posts. `score` and `commentCount` are kept in step with
 * post_votes and comments (in the same transaction) so listing never counts rows.
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid().primaryKey().defaultRandom(),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    url: text(),
    body: text(),
    // Starts at 1: the author's own vote.
    score: integer().notNull().default(1),
    commentCount: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("posts_created_at").on(t.createdAt.desc()), index("posts_author_id").on(t.authorId)],
);

/** One upvote per member per post. */
export const postVotes = pgTable(
  "post_votes",
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("post_votes_user_id").on(t.userId)],
);

/** Threaded comments: a null parentId is a top-level comment on the post. */
export const comments = pgTable(
  "comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    parentId: uuid().references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_post_id").on(t.postId, t.createdAt)],
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
