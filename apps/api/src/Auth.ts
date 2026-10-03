import { HttpApiBuilder, HttpApiError, HttpApp, HttpClient, HttpClientRequest, HttpClientResponse, HttpServerResponse } from "@effect/platform";
import { issuer } from "@openauthjs/openauth";
import { createClient } from "@openauthjs/openauth/client";
import { GithubProvider } from "@openauthjs/openauth/provider/github";
import { createSubjects } from "@openauthjs/openauth/subject";
import { Authentication, LinkedAuthentication, OptionalAuthentication } from "@waifu-devs/domain/api";
import { Config, Effect, Layer, Option, Redacted, Runtime, Schema } from "effect";
import { downloadGithubAvatar, MediaStore, newKey, processImage } from "./Media.ts";
import { makeStorage } from "./Storage.ts";
import { type GithubProfile, Users } from "./Users.ts";

/** The web app's OpenAuth client: the only one whose tokens open this API. */
export const CLIENT_ID = "waifu-devs-web";

/** Where a fuwa instance takes people back to after they sign in with waifu.dev. */
export const LINKED_CALLBACK = "/auth/waifu/callback";

/**
 * Whether an app other than the web app may sign people in here. Any fuwa
 * instance can: its client ID is its own address (https, or http on this
 * machine), and the sign-in only ever goes back to that address's callback.
 * It must use the code flow with PKCE, so the code is worthless to anyone who
 * didn't start the sign-in. Its tokens are made out to it (`aud`), and this
 * API only takes the web app's, so all it learns is who signed in (/userinfo).
 */
export function linkedClient(clientID: string, redirectURI: string, query: URLSearchParams): boolean {
  let base: URL;
  try {
    base = new URL(clientID);
  } catch {
    return false;
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && local)) return false;
  // The client ID is the instance's base address exactly: no trailing slash, query, hash or credentials.
  if (base.username || base.password || base.search || base.hash || base.href.replace(/\/$/, "") !== clientID) return false;
  return (
    redirectURI === clientID + LINKED_CALLBACK &&
    query.get("response_type") === "code" &&
    query.get("code_challenge_method") === "S256" &&
    !!query.get("code_challenge")
  );
}

/** What kind of failure an error is, for logs that mustn't carry what it says. */
const tagOf = (error: unknown) => (typeof error === "object" && error !== null && "_tag" in error ? String(error._tag) : "unknown");

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
    /** Whether a sign-in may go back where it asks to: the web app, or a fuwa instance's own callback. */
    const allowed = (clientID: string, redirectURI: string, query: URLSearchParams) => {
      if (clientID !== CLIENT_ID) return linkedClient(clientID, redirectURI, query);
      try {
        return new URL(redirectURI).origin === webOrigin;
      } catch {
        return false;
      }
    };
    const github = {
      clientID: yield* Config.string("GITHUB_CLIENT_ID"),
      clientSecret: yield* Config.redacted("GITHUB_CLIENT_SECRET"),
    };

    const users = yield* Users;
    const httpClient = yield* HttpClient.HttpClient;
    const http = httpClient.pipe(HttpClient.filterStatusOk);
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

    const media = yield* MediaStore;

    /**
     * Keeps our own copy of a member's GitHub avatar, made at sign-in whenever
     * it changed, so the site never sends anyone's browser to GitHub for it. If
     * GitHub doesn't hand it over, the sign-in goes ahead and the next one tries again.
     */
    const copyGithubAvatar = (userId: string, avatarUrl: string) =>
      Effect.gen(function* () {
        const webp = yield* downloadGithubAvatar(avatarUrl).pipe(
          Effect.provideService(HttpClient.HttpClient, httpClient),
          Effect.flatMap((bytes) => processImage("avatar", bytes)),
        );
        const key = newKey("avatar", userId);
        yield* media.put(key, webp);
        const unused = yield* users.setGithubAvatar(userId, avatarUrl, key);
        if (unused) yield* media.remove(unused);
      }).pipe(
        // Only the kind of failure: nothing about who, or what GitHub said.
        Effect.catchAll((error) => Effect.logWarning(`Copying a GitHub avatar failed (${tagOf(error)})`)),
      );

    /** Signs a GitHub account in: creates or refreshes the member, and their avatar if it changed. */
    const signIn = (gh: GithubProfile) =>
      users.upsertFromGithub(gh).pipe(
        Effect.tap(({ user, avatarStale }) => (avatarStale ? copyGithubAvatar(user.id, gh.avatar_url) : Effect.void)),
        Effect.map(({ user }) => user),
      );

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
      allow: async ({ clientID, redirectURI }, req) => allowed(clientID, redirectURI, new URL(req.url).searchParams),
      success: (ctx, value) =>
        run(
          githubProfile(value.tokenset.access).pipe(
            Effect.flatMap(signIn),
            Effect.withSpan("Issuer.success"),
          ),
        ).then((user) => ctx.subject("user", { id: user.id })),
    });

    /** Runs a web request through the issuer, as if it arrived at `issuerUrl`. */
    const handle = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      // OpenAuth answers a refused sign-in by redirecting to the address it was refused for,
      // which would let anyone bounce people off waifu.dev to any site. Refuse it here instead.
      if (url.pathname === "/authorize") {
        const clientID = url.searchParams.get("client_id") ?? "";
        const redirectURI = url.searchParams.get("redirect_uri") ?? "";
        if (!allowed(clientID, redirectURI, url.searchParams)) return new Response("This app can't sign in with waifu.dev.", { status: 400 });
      }
      const headers = new Headers(request.headers);
      for (const name of ["host", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"]) headers.delete(name);
      const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readLimited(request, MAX_ISSUER_BODY);
      if (body === null) return new Response("Too big.", { status: 413 });
      return app.fetch(new Request(new URL(url.pathname + url.search, issuerUrl), { method: request.method, headers, body }));
    };

    // Verifies access tokens against this issuer's keys, without leaving the process.
    const client = createClient({
      clientID: CLIENT_ID,
      issuer: issuerUrl.origin,
      fetch: (input, init) => handle(new Request(input, init)),
    });

    /** The user a token is for, whichever app it was made for. */
    const verifyAny = (token: string) =>
      Effect.tryPromise(() => client.verify(subjects, token)).pipe(
        Effect.flatMap((result) => (result.err ? Effect.fail(result.err) : Effect.succeed({ id: result.subject.properties.id, aud: result.aud }))),
      );

    /** The user a token is for, if it was made for the web app: other apps' tokens open nothing else here. */
    const verify = (token: string) =>
      verifyAny(token).pipe(Effect.flatMap(({ id, aud }) => (aud === CLIENT_ID ? Effect.succeed(id) : Effect.fail(new Error("token is for another app")))));

    return { handle, verify, verifyAny } as const;
  }),
}) {}

/** OpenAuth's endpoints only take small forms (codes and tokens). */
const MAX_ISSUER_BODY = 64 * 1024;

/** A request's body, or null as soon as it passes `max` bytes (whatever Content-Length claimed). */
async function readLimited(request: Request, max: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  if (!request.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > max) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

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

/** Any app's token, for /userinfo: it says who signed in, and opens nothing else. */
export const LinkedAuthenticationLive = Layer.effect(
  LinkedAuthentication,
  Effect.gen(function* () {
    const issuer = yield* Issuer;
    const users = yield* Users;
    return {
      bearer: (token) =>
        issuer.verifyAny(Redacted.value(token)).pipe(
          Effect.mapError(() => new HttpApiError.Unauthorized()),
          Effect.flatMap(({ id }) => Effect.orDie(users.byId(id))),
          Effect.flatMap(Option.match({ onNone: () => Effect.fail(new HttpApiError.Unauthorized()), onSome: Effect.succeed })),
        ),
    };
  }),
);
