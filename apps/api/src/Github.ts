import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import type { Repo } from "@waifu-devs/domain/api";
import { Clock, Config, Data, Duration, Effect, Option, Redacted, Ref, Schema } from "effect";

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
/** How long turned-down credentials are left alone before they're tried again (GitHub can 401 by mistake). */
const RETRY_CREDENTIALS_AFTER = Duration.minutes(15);

/** One way of asking GitHub; `apply` adds its credentials to a request. */
interface Credential {
  readonly name: string;
  readonly apply: (request: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest;
}

/**
 * GitHub's REST API, for public repos only. Calls carry the best credentials
 * GitHub accepts, in this order: GITHUB_TOKEN when it's set (a token that can
 * read public data, 5,000 calls an hour), the site's GitHub app (its client ID
 * and secret, which GitHub only takes from OAuth apps), then none at all (60 an
 * hour). When GitHub turns one down with a 401, the next is used, and the
 * better ones are tried again after RETRY_CREDENTIALS_AFTER.
 */
export class Github extends Effect.Service<Github>()("Github", {
  effect: Effect.gen(function* () {
    // Overridable so the API can run against a stand-in locally.
    const base = yield* Config.string("GITHUB_API_URL").pipe(Config.withDefault("https://api.github.com"));
    // Railway passes an unset shared variable through as an empty string.
    const token = (yield* Config.option(Config.redacted("GITHUB_TOKEN"))).pipe(
      Option.filter((value) => Redacted.value(value).trim() !== ""),
    );
    const clientId = yield* Config.string("GITHUB_CLIENT_ID");
    const clientSecret = yield* Config.redacted("GITHUB_CLIENT_SECRET");
    const http = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(
          HttpClientRequest.prependUrl(base),
          HttpClientRequest.acceptJson,
          HttpClientRequest.setHeader("User-Agent", "waifu-devs"),
          HttpClientRequest.setHeader("X-GitHub-Api-Version", "2022-11-28"),
        ),
      ),
    );

    const credentials: ReadonlyArray<Credential> = [
      ...Option.match(token, {
        onNone: () => [],
        onSome: (value) => [{ name: "GITHUB_TOKEN", apply: HttpClientRequest.bearerToken(Redacted.value(value)) }],
      }),
      { name: "the GitHub app's client ID and secret", apply: HttpClientRequest.basicAuth(clientId, Redacted.value(clientSecret)) },
      { name: "no credentials", apply: (request) => request },
    ];
    /** Which of `credentials` GitHub still takes, and since when. */
    const using = yield* Ref.make({ index: 0, since: 0 });
    const retryAfter = Duration.toMillis(RETRY_CREDENTIALS_AFTER);

    /** Asks GitHub, moving on to the next credentials if these are turned down. */
    const send = (path: string, urlParams: Record<string, string>) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        yield* Ref.update(using, (state) => (state.index > 0 && now - state.since >= retryAfter ? { index: 0, since: now } : state));
        while (true) {
          const { index } = yield* Ref.get(using);
          const credential = credentials[index]!;
          const response = yield* http.execute(credential.apply(HttpClientRequest.get(path, { urlParams })));
          if (response.status !== 401 || index === credentials.length - 1) return response;
          // Another request may have moved on already; only the first says so.
          const movedOn = yield* Ref.modify(using, (state) =>
            state.index === index ? [true, { index: index + 1, since: now }] : [false, state],
          );
          if (movedOn) {
            yield* Effect.logWarning(`GitHub turned down ${credential.name} (401); using ${credentials[index + 1]!.name} for now`);
          }
        }
      });

    /**
     * A GET that decodes the body, or None when GitHub says there's no such thing (404).
     * `route` names the endpoint for the logs without the login or org in it.
     */
    const get = <A, I>(route: string, path: string, schema: Schema.Schema<A, I>, urlParams: Record<string, string> = {}) =>
      send(path, urlParams).pipe(
        Effect.flatMap((response) =>
          response.status === 404
            ? Effect.succeedNone
            : response.status === 200
              ? HttpClientResponse.schemaBodyJson(schema)(response).pipe(
                  Effect.tapError(() => Effect.logWarning(`GitHub's answer for ${route} didn't decode`)),
                  Effect.map(Option.some),
                )
              : Effect.logWarning(
                  `GitHub answered ${response.status} for ${route}` +
                    (response.headers["x-ratelimit-remaining"] === "0" ? " (rate limit spent)" : ""),
                ).pipe(Effect.zipRight(Effect.fail(new Error(`GitHub answered ${response.status} for ${route}`)))),
        ),
        Effect.scoped,
        Effect.timeout("10 seconds"),
        Effect.mapError((cause) => new GithubError({ cause })),
        Effect.withSpan("Github.get", { attributes: { route } }),
      );

    const segment = encodeURIComponent;
    const publicRepos = (repos: ReadonlyArray<RepoJson>) => repos.filter((repo) => !repo.private).map(toRepo);

    /** One public repo by its id, or None if it's gone or private now. */
    const repo = (id: number) =>
      get("/repositories/:id", `/repositories/${id}`, RepoJson).pipe(Effect.map(Option.filter((json) => !json.private)), Effect.map(Option.map(toRepo)));

    /** The public repos a user owns, most recently pushed first. */
    const ownRepos = (login: string) =>
      Effect.gen(function* () {
        const repos: Repo[] = [];
        for (let page = 1; page <= OWN_PAGES; page++) {
          const batch = Option.getOrElse(
            yield* get("/users/:login/repos", `/users/${segment(login)}/repos`, Schema.Array(RepoJson), {
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
      get("/users/:login/orgs", `/users/${segment(login)}/orgs`, Schema.Array(OrgJson), { per_page: String(PAGE) }).pipe(
        Effect.map((found) => Option.getOrElse(found, () => []).map((org) => org.login)),
      );

    /** An organization's public repos, most recently pushed first. */
    const orgRepos = (org: string) =>
      get("/orgs/:org/repos", `/orgs/${segment(org)}/repos`, Schema.Array(RepoJson), { type: "public", sort: "pushed", per_page: String(PAGE) }).pipe(
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
