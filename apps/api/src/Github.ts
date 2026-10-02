import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import type { Repo } from "@waifu-devs/domain/api";
import { Config, Data, Effect, Option, Redacted, Schema } from "effect";

/** GitHub didn't answer usefully: it's down, slow, or this app is over its rate limit. */
export class GithubError extends Data.TaggedError("GithubError")<{ readonly cause: unknown }> {}

/** The parts of GitHub's repository JSON a profile card uses. */
const RepoJson = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  owner: Schema.Struct({ login: Schema.String }),
  private: Schema.Boolean,
  description: Schema.NullOr(Schema.String),
  language: Schema.NullOr(Schema.String),
  stargazers_count: Schema.Number,
  forks_count: Schema.Number,
  fork: Schema.Boolean,
  archived: Schema.Boolean,
  topics: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  pushed_at: Schema.NullOr(Schema.String),
});
type RepoJson = typeof RepoJson.Type;

const OrgJson = Schema.Struct({ login: Schema.String });

const toRepo = (json: RepoJson): Repo => ({
  id: json.id,
  owner: json.owner.login,
  name: json.name,
  description: json.description?.trim() || null,
  language: json.language,
  stars: json.stargazers_count,
  forks: json.forks_count,
  fork: json.fork,
  archived: json.archived,
  topics: json.topics,
  pushedAt: json.pushed_at ? new Date(json.pushed_at) : null,
});

/** GitHub lists at most this many repos a page. */
const PAGE = 100;
/** How many pages of a member's own repos the picker offers (sorted by last push). */
const OWN_PAGES = 3;
/** How many of a member's public organizations the picker offers repos from. */
const MAX_ORGS = 8;

/**
 * GitHub's REST API, for public repos only. Calls are made as the site's
 * GitHub OAuth app (its client ID and secret), which GitHub allows for public
 * data with a much higher rate limit than anonymous calls.
 */
export class Github extends Effect.Service<Github>()("Github", {
  effect: Effect.gen(function* () {
    // Overridable so the API can run against a stand-in locally.
    const base = yield* Config.string("GITHUB_API_URL").pipe(Config.withDefault("https://api.github.com"));
    const clientId = yield* Config.string("GITHUB_CLIENT_ID");
    const clientSecret = yield* Config.redacted("GITHUB_CLIENT_SECRET");
    const http = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(
          HttpClientRequest.prependUrl(base),
          HttpClientRequest.basicAuth(clientId, Redacted.value(clientSecret)),
          HttpClientRequest.acceptJson,
          HttpClientRequest.setHeader("User-Agent", "waifu-devs"),
          HttpClientRequest.setHeader("X-GitHub-Api-Version", "2022-11-28"),
        ),
      ),
    );

    /** A GET that decodes the body, or None when GitHub says there's no such thing (404). */
    const get = <A, I>(path: string, schema: Schema.Schema<A, I>, urlParams: Record<string, string> = {}) =>
      http.get(path, { urlParams }).pipe(
        Effect.flatMap((response) =>
          response.status === 404
            ? Effect.succeedNone
            : response.status === 200
              ? HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.map(Option.some))
              : Effect.fail(new Error(`GitHub answered ${response.status} for ${path}`)),
        ),
        Effect.scoped,
        Effect.timeout("10 seconds"),
        Effect.mapError((cause) => new GithubError({ cause })),
        Effect.withSpan("Github.get", { attributes: { path } }),
      );

    const segment = encodeURIComponent;
    const publicRepos = (repos: ReadonlyArray<RepoJson>) => repos.filter((repo) => !repo.private).map(toRepo);

    /** One public repo by its id, or None if it's gone or private now. */
    const repo = (id: number) =>
      get(`/repositories/${id}`, RepoJson).pipe(Effect.map(Option.filter((json) => !json.private)), Effect.map(Option.map(toRepo)));

    /** The public repos a user owns, most recently pushed first. */
    const ownRepos = (login: string) =>
      Effect.gen(function* () {
        const repos: Repo[] = [];
        for (let page = 1; page <= OWN_PAGES; page++) {
          const batch = Option.getOrElse(
            yield* get(`/users/${segment(login)}/repos`, Schema.Array(RepoJson), {
              type: "owner",
              sort: "pushed",
              per_page: String(PAGE),
              page: String(page),
            }),
            () => [],
          );
          repos.push(...publicRepos(batch));
          if (batch.length < PAGE) break;
        }
        return repos;
      });

    /** The organizations a user is a public member of. */
    const orgs = (login: string) =>
      get(`/users/${segment(login)}/orgs`, Schema.Array(OrgJson), { per_page: String(PAGE) }).pipe(
        Effect.map((found) => Option.getOrElse(found, () => []).map((org) => org.login)),
      );

    /** An organization's public repos, most recently pushed first. */
    const orgRepos = (org: string) =>
      get(`/orgs/${segment(org)}/repos`, Schema.Array(RepoJson), { type: "public", sort: "pushed", per_page: String(PAGE) }).pipe(
        Effect.map((found) => publicRepos(Option.getOrElse(found, () => []))),
      );

    /**
     * Every public repo a user could feature: their own, and those of the
     * organizations they're a public member of. Most recently pushed first.
     */
    const featurable = (login: string) =>
      Effect.gen(function* () {
        const [own, memberships] = yield* Effect.all([ownRepos(login), orgs(login)], { concurrency: 2 });
        const fromOrgs = yield* Effect.forEach(memberships.slice(0, MAX_ORGS), orgRepos, { concurrency: 4 });
        const seen = new Set<number>();
        return [...own, ...fromOrgs.flat()]
          .filter((repo) => !seen.has(repo.id) && seen.add(repo.id))
          .sort((a, b) => (b.pushedAt?.getTime() ?? 0) - (a.pushedAt?.getTime() ?? 0));
      });

    return { repo, featurable } as const;
  }),
}) {}
