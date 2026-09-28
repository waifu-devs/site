import { HttpApiBuilder, HttpApiError, HttpApp, HttpClient, HttpClientRequest, HttpClientResponse, HttpServerResponse } from "@effect/platform";
import { issuer } from "@openauthjs/openauth";
import { createClient } from "@openauthjs/openauth/client";
import { GithubProvider } from "@openauthjs/openauth/provider/github";
import { createSubjects } from "@openauthjs/openauth/subject";
import { Authentication, OptionalAuthentication } from "@waifu-devs/domain/api";
import { Config, Effect, Layer, Option, Redacted, Runtime, Schema } from "effect";
import { makeStorage } from "./Storage.ts";
import { Users } from "./Users.ts";

/** The only OpenAuth client: the web app. */
export const CLIENT_ID = "waifu-devs-web";

/** What an OpenAuth access token says about who is signed in. */
export const subjects = createSubjects({
  user: Schema.standardSchemaV1(Schema.Struct({ id: Schema.String })),
});

const GithubUser = Schema.Struct({
  id: Schema.Number,
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatar_url: Schema.String,
});

/**
 * The OpenAuth issuer (GitHub is the only provider), served by this API at the
 * root paths OpenAuth expects: /authorize, /token, /github/*, /.well-known/*.
 */
export class Issuer extends Effect.Service<Issuer>()("Issuer", {
  effect: Effect.gen(function* () {
    // The public URL of this API. Tokens name it as their issuer, so requests are
    // rewritten onto it whichever host (public or private network) they came in on.
    const issuerUrl = new URL(yield* Config.string("ISSUER_URL"));
    // Where the web app lives: the only place a sign-in may redirect back to.
    const webOrigin = new URL(yield* Config.string("WEB_URL")).origin;
    const github = {
      clientID: yield* Config.string("GITHUB_CLIENT_ID"),
      clientSecret: yield* Config.redacted("GITHUB_CLIENT_SECRET"),
    };

    const users = yield* Users;
    const http = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
    const storage = yield* makeStorage;
    const run = Runtime.runPromise(yield* Effect.runtime<never>());

    const githubProfile = (accessToken: string) =>
      http
        .execute(
          HttpClientRequest.get("https://api.github.com/user").pipe(
            HttpClientRequest.bearerToken(accessToken),
            HttpClientRequest.acceptJson,
            HttpClientRequest.setHeader("User-Agent", "waifu-devs"),
          ),
        )
        .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(GithubUser)), Effect.scoped);

    const app = issuer({
      subjects,
      storage,
      providers: {
        github: GithubProvider({
          clientID: github.clientID,
          clientSecret: Redacted.value(github.clientSecret),
          scopes: ["read:user"],
        }),
      },
      // Access tokens can't be revoked, so keep them short; the web app refreshes them.
      ttl: { access: 60 * 60 },
      allow: async ({ clientID, redirectURI }) => clientID === CLIENT_ID && new URL(redirectURI).origin === webOrigin,
      success: (ctx, value) =>
        run(
          githubProfile(value.tokenset.access).pipe(
            Effect.flatMap(users.upsertFromGithub),
            Effect.withSpan("Issuer.success"),
          ),
        ).then((user) => ctx.subject("user", { id: user.id })),
    });

    /** Runs a web request through the issuer, as if it arrived at `issuerUrl`. */
    const handle = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const headers = new Headers(request.headers);
      for (const name of ["host", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"]) headers.delete(name);
      const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
      return app.fetch(new Request(new URL(url.pathname + url.search, issuerUrl), { method: request.method, headers, body }));
    };

    // Verifies access tokens against this issuer's keys, without leaving the process.
    const client = createClient({
      clientID: CLIENT_ID,
      issuer: issuerUrl.origin,
      fetch: (input, init) => handle(new Request(input, init)),
    });

    const verify = (token: string) =>
      Effect.tryPromise(() => client.verify(subjects, token)).pipe(
        Effect.flatMap((result) => (result.err ? Effect.fail(result.err) : Effect.succeed(result.subject.properties.id))),
      );

    return { handle, verify } as const;
  }),
}) {}

/** Mounts the issuer's routes next to the HttpApi endpoints. */
export const IssuerRoutes = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const { handle } = yield* Issuer;
    const app = HttpApp.fromWebHandler(handle);
    yield* router.all("/authorize", app);
    yield* router.all("/token", app);
    yield* router.all("/github/*", app);
    yield* router.all("/.well-known/*", app);
    yield* router.get("/health", HttpServerResponse.text("ok"));
  }),
);

/** Bearer tokens are OpenAuth access tokens; they resolve to the signed-in user. */
export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const issuer = yield* Issuer;
    const users = yield* Users;
    return {
      bearer: (token) =>
        issuer.verify(Redacted.value(token)).pipe(
          Effect.mapError(() => new HttpApiError.Unauthorized()),
          Effect.flatMap((id) => Effect.orDie(users.byId(id))),
          Effect.flatMap(Option.match({ onNone: () => Effect.fail(new HttpApiError.Unauthorized()), onSome: Effect.succeed })),
        ),
    };
  }),
);

/** The same bearer tokens, on endpoints anyone may call: a missing or bad token is just nobody. */
export const OptionalAuthenticationLive = Layer.effect(
  OptionalAuthentication,
  Effect.gen(function* () {
    const issuer = yield* Issuer;
    const users = yield* Users;
    return {
      bearer: (token) =>
        Redacted.value(token)
          ? issuer.verify(Redacted.value(token)).pipe(
              Effect.option,
              Effect.flatMap(Option.match({ onNone: () => Effect.succeedNone, onSome: (id) => Effect.orDie(users.byId(id)) })),
            )
          : Effect.succeedNone,
    };
  }),
);
