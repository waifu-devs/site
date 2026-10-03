import { SqlClient } from "@effect/sql";
import type { ImageKind, ProfileUpdate, User } from "@waifu-devs/domain/api";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import { Effect, Option, Schema } from "effect";
import { Db } from "./Db.ts";
import { mediaUrl } from "./Media.ts";
import { users } from "./schema.ts";

export const UUID = Schema.UUID;
const isUuid = Schema.is(UUID);

export type GithubProfile = { id: number; login: string; name: string | null; avatar_url: string };

type Row = typeof users.$inferSelect;

export class Users extends Effect.Service<Users>()("Users", {
  effect: Effect.gen(function* () {
    const db = yield* Db;
    const client = yield* SqlClient.SqlClient;
    // This API's public URL, where uploaded pictures are served (see Media.ts).
    const media = yield* mediaUrl;

    /**
     * A row as the API shows it: uploaded pictures win over the GitHub avatar,
     * and a country nobody chose to show is only in the member's own copy.
     * Pictures are always our own copies; until a member's GitHub avatar has been
     * copied (at their next sign-in) they have none, and the site shows an initial.
     */
    const toUser = ({ githubAvatarKey, ...row }: Row, self: boolean): User => ({
      ...row,
      avatarUrl: row.avatarKey ? media(row.avatarKey) : githubAvatarKey ? media(githubAvatarKey) : null,
      customAvatar: row.avatarKey !== null,
      bannerUrl: row.bannerKey ? media(row.bannerKey) : null,
      country: self || row.showCountry ? row.country : null,
    });

    const first = (rows: ReadonlyArray<Row>, self: boolean) => Option.fromNullable(rows[0]).pipe(Option.map((row) => toUser(row, self)));

    /** By id: the member themselves, so their own hidden fields come back. */
    const byId = (id: string) =>
      isUuid(id)
        ? db.select().from(users).where(eq(users.id, id)).pipe(Effect.map((rows) => first(rows, true)))
        : Effect.succeed(Option.none());

    const byUsername = (username: string) =>
      db
        .select()
        .from(users)
        .where(sql`lower(${users.username}) = lower(${username})`)
        .pipe(Effect.map((rows) => first(rows, false)));

    const list = (limit: number) =>
      db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .pipe(Effect.map((rows) => rows.map((row) => toUser(row, false))));

    const countAll = db
      .select({ n: count() })
      .from(users)
      .pipe(Effect.map((rows) => rows[0]?.n ?? 0));

    // Fields left undefined are not touched.
    const update = (id: string, { skills, links, ...fields }: Partial<ProfileUpdate & { themeId: string }>) =>
      db
        .update(users)
        .set({ ...fields, skills: skills && [...skills], links: links && [...links] })
        .where(eq(users.id, id))
        .returning()
        .pipe(Effect.map((rows) => toUser(rows[0], true)));

    /** Points a member's avatar or banner at a stored picture (or none); returns the key it replaced. */
    const setImage = (id: string, kind: ImageKind, key: string | null) =>
      client.withTransaction(
        Effect.gen(function* () {
          const column = kind === "avatar" ? users.avatarKey : users.bannerKey;
          const [before] = yield* db.select({ key: column }).from(users).where(eq(users.id, id)).for("update");
          const [row] = yield* db
            .update(users)
            .set(kind === "avatar" ? { avatarKey: key } : { bannerKey: key })
            .where(eq(users.id, id))
            .returning();
          return { user: toUser(row, true), previous: before?.key ?? null };
        }),
      );

    /**
     * Points a member at a new copy of their GitHub avatar, if it is still the
     * one from `sourceUrl` (a sign-in running alongside may have moved on); returns
     * whichever key is no longer used, to delete.
     */
    const setGithubAvatar = (id: string, sourceUrl: string, key: string) =>
      client.withTransaction(
        Effect.gen(function* () {
          const [before] = yield* db
            .select({ key: users.githubAvatarKey, url: users.avatarUrl })
            .from(users)
            .where(eq(users.id, id))
            .for("update");
          if (!before || before.url !== sourceUrl) return key;
          yield* db.update(users).set({ githubAvatarKey: key }).where(eq(users.id, id));
          return before.key;
        }),
      );

    /**
     * Creates the user on first login, otherwise refreshes the GitHub-owned fields.
     * `avatarStale` says whether our copy of the GitHub avatar needs fetching again.
     */
    const upsertFromGithub = (gh: GithubProfile) =>
      client.withTransaction(
        Effect.gen(function* () {
          const [before] = yield* db
            .select({ url: users.avatarUrl, key: users.githubAvatarKey })
            .from(users)
            .where(eq(users.githubId, gh.id))
            .for("update");
          // GitHub logins can be renamed and later reclaimed by someone else. Free the
          // login from any stale account so the unique index doesn't block sign-in.
          yield* db
            .update(users)
            .set({ username: sql`${users.username} || '-' || ${users.githubId}` })
            .where(and(sql`lower(${users.username}) = lower(${gh.login})`, ne(users.githubId, gh.id)));
          const [user] = yield* db
            .insert(users)
            .values({ githubId: gh.id, username: gh.login, displayName: gh.name, avatarUrl: gh.avatar_url })
            .onConflictDoUpdate({
              target: users.githubId,
              set: { username: gh.login, avatarUrl: gh.avatar_url, updatedAt: sql`now()` },
            })
            .returning();
          return { user, avatarStale: !before?.key || before.url !== gh.avatar_url };
        }),
      );

    return { byId, byUsername, list, count: countAll, update, setImage, setGithubAvatar, upsertFromGithub } as const;
  }),
}) {}
