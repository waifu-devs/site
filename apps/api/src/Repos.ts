import { SqlClient } from "@effect/sql";
import type { Repo } from "@waifu-devs/domain/api";
import { MAX_FEATURED_REPOS } from "@waifu-devs/domain/profile";
import { and, asc, eq } from "drizzle-orm";
import { Cache, Duration, Effect, Exit, Option } from "effect";
import { Db } from "./Db.ts";
import { Github } from "./Github.ts";
import { featuredRepos, users } from "./schema.ts";

type Row = typeof featuredRepos.$inferSelect;

/** How old a card's stars, description and so on may get before GitHub is asked again. */
const REFRESH_AFTER = Duration.hours(6);
/** How long the list of repos a member could feature is kept between picker visits and saves. */
const CHOICES_TTL = Duration.minutes(10);

const toRepo = (row: Row): Repo => ({
  id: row.repoId,
  owner: row.owner,
  name: row.name,
  description: row.description,
  language: row.language,
  stars: row.stars,
  forks: row.forks,
  fork: row.fork,
  archived: row.archived,
  topics: row.topics,
  pushedAt: row.pushedAt,
});

/** A repo's details as columns. */
const details = (repo: Repo) => ({
  owner: repo.owner,
  name: repo.name,
  description: repo.description,
  language: repo.language,
  stars: repo.stars,
  forks: repo.forks,
  fork: repo.fork,
  archived: repo.archived,
  topics: [...repo.topics],
  pushedAt: repo.pushedAt,
});

/**
 * The public GitHub repos members feature on their profiles. A member can feature
 * their own repos and their public organizations' (what GitHub lists for them);
 * cards keep a copy of each repo's details, refreshed when a profile is visited
 * and the copy is older than REFRESH_AFTER.
 */
export class Repos extends Effect.Service<Repos>()("Repos", {
  effect: Effect.gen(function* () {
    const db = yield* Db;
    const client = yield* SqlClient.SqlClient;
    const github = yield* Github;

    // Failures aren't kept, so the next try asks GitHub again.
    const choices = yield* Cache.makeWith({
      capacity: 1024,
      lookup: github.featurable,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? CHOICES_TTL : Duration.zero),
    });

    /** What a member could feature. GitHub logins aren't case-sensitive, so neither is the cache. */
    const choicesFor = (login: string) => choices.get(login.toLowerCase());

    const featured = (userId: string) =>
      db.select().from(featuredRepos).where(eq(featuredRepos.userId, userId)).orderBy(asc(featuredRepos.position));

    // Members whose cards are being refreshed right now, so a busy profile asks GitHub once.
    const refreshing = new Set<string>();

    /** Copies fresh details from GitHub; a repo that's gone or private now comes off the profile. */
    const refresh = (userId: string, rows: ReadonlyArray<Row>) =>
      Effect.forEach(
        rows,
        (row) =>
          github.repo(row.repoId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => db.delete(featuredRepos).where(and(eq(featuredRepos.userId, userId), eq(featuredRepos.repoId, row.repoId))),
                onSome: (repo) =>
                  db
                    .update(featuredRepos)
                    .set({ ...details(repo), refreshedAt: new Date() })
                    .where(and(eq(featuredRepos.userId, userId), eq(featuredRepos.repoId, row.repoId))),
              }),
            ),
          ),
        { concurrency: 3, discard: true },
      ).pipe(
        Effect.catchAll((error) => Effect.logWarning("Couldn't refresh featured repos", error)),
        Effect.ensuring(Effect.sync(() => refreshing.delete(userId))),
        Effect.withSpan("Repos.refresh"),
      );

    /**
     * A member's featured repos, in their order. Stale cards are shown as they are
     * while fresh details are fetched in the background for the next visitor.
     */
    const forUser = (userId: string) =>
      featured(userId).pipe(
        Effect.tap((rows) => {
          const cutoff = Date.now() - Duration.toMillis(REFRESH_AFTER);
          if (refreshing.has(userId) || !rows.some((row) => row.refreshedAt.getTime() < cutoff)) return Effect.void;
          refreshing.add(userId);
          return Effect.forkDaemon(refresh(userId, rows));
        }),
        Effect.map((rows) => rows.map(toRepo)),
      );

    /**
     * Features these repos, in this order. Repos already featured keep their cards;
     * new ones must be among the member's choices, and anything else is left out.
     */
    const feature = (user: { id: string; username: string }, ids: ReadonlyArray<number>) =>
      Effect.gen(function* () {
        const wanted = [...new Set(ids)].slice(0, MAX_FEATURED_REPOS);
        const current = yield* featured(user.id);
        if (wanted.length === current.length && wanted.every((id, i) => current[i].repoId === id)) return current.map(toRepo);

        const kept = new Map(current.map((row) => [row.repoId, row]));
        // Only new repos need checking, so reordering or removing never waits on GitHub.
        const offered = wanted.some((id) => !kept.has(id))
          ? new Map((yield* choicesFor(user.username)).map((repo) => [repo.id, repo]))
          : new Map<number, Repo>();
        const now = new Date();
        const rows = wanted
          .flatMap((repoId): Array<Omit<Row, "position">> => {
            const old = kept.get(repoId);
            if (old) return [old];
            const repo = offered.get(repoId);
            return repo ? [{ userId: user.id, repoId, ...details(repo), refreshedAt: now }] : [];
          })
          .map((row, position) => ({ ...row, position }));

        yield* client.withTransaction(
          Effect.gen(function* () {
            // One save at a time per member, so two at once can't both insert.
            yield* db.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
            yield* db.delete(featuredRepos).where(eq(featuredRepos.userId, user.id));
            if (rows.length) yield* db.insert(featuredRepos).values(rows);
          }),
        );
        return rows.map(toRepo);
      });

    return { forUser, feature, choices: choicesFor } as const;
  }),
  dependencies: [Github.Default],
}) {}
