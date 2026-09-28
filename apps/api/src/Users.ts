import { SqlClient } from "@effect/sql";
import type { ProfileUpdate, User } from "@waifu-devs/domain/api";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import { Effect, Option, Schema } from "effect";
import { Db } from "./Db.ts";
import { users } from "./schema.ts";

export const UUID = Schema.UUID;
const isUuid = Schema.is(UUID);

export type GithubProfile = { id: number; login: string; name: string | null; avatar_url: string };

export class Users extends Effect.Service<Users>()("Users", {
  effect: Effect.gen(function* () {
    const db = yield* Db;
    const client = yield* SqlClient.SqlClient;

    const first = <A>(rows: ReadonlyArray<A>) => Option.fromNullable(rows[0]);

    const byId = (id: string) =>
      isUuid(id)
        ? db.select().from(users).where(eq(users.id, id)).pipe(Effect.map(first))
        : Effect.succeed(Option.none());

    const byUsername = (username: string) =>
      db
        .select()
        .from(users)
        .where(sql`lower(${users.username}) = lower(${username})`)
        .pipe(Effect.map(first));

    const list = (limit: number) => db.select().from(users).orderBy(desc(users.createdAt)).limit(limit);

    const countAll = db
      .select({ n: count() })
      .from(users)
      .pipe(Effect.map((rows) => rows[0]?.n ?? 0));

    const update = (id: string, fields: Partial<ProfileUpdate & { themeId: string }>) =>
      db
        .update(users)
        .set(fields)
        .where(eq(users.id, id))
        .returning()
        .pipe(Effect.map((rows) => rows[0] as User));

    /** Creates the user on first login, otherwise refreshes the GitHub-owned fields. */
    const upsertFromGithub = (gh: GithubProfile) =>
      client.withTransaction(
        Effect.gen(function* () {
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
          return user;
        }),
      );

    return { byId, byUsername, list, count: countAll, update, upsertFromGithub } as const;
  }),
}) {}
