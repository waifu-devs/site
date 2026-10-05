import { createClient } from "@openauthjs/openauth/client";
import type { User } from "@waifu-devs/domain/api";
import { DEFAULT_THEME } from "@waifu-devs/domain/themes";
import { Data, Effect, Option } from "effect";
import { ApiClient, Urls } from "./Api.ts";
import { RequestContext } from "./Request.ts";

export const ACCESS_COOKIE = "wd_access";
export const REFRESH_COOKIE = "wd_refresh";
/** Short-lived cookie holding the sign-in state, PKCE verifier and destination. */
export const LOGIN_COOKIE = "wd_login";
/** The theme a signed-out visitor wears; members wear theirs on their account. */
export const THEME_COOKIE = "wd_theme";
/** The language this browser picked; without it, the browser's own languages decide. */
export const LANGUAGE_COOKIE = "wd_lang";
/** Must match the API's OpenAuth client id. */
export const CLIENT_ID = "waifu-devs-web";
/** Matches OpenAuth's refresh token lifetime; the access token inside expires sooner. */
const TOKEN_MAX_AGE = 60 * 60 * 24 * 365;

export class OpenAuthError extends Data.TaggedError("OpenAuthError")<{ reason: string }> {}

export type Tokens = { access: string; refresh: string };

/** OpenAuth's client for the API's issuer, plus the token cookies it hands out. */
export class Session extends Effect.Service<Session>()("Session", {
  effect: Effect.gen(function* () {
    const urls = yield* Urls;
    const api = yield* ApiClient;
    const client = createClient({
      clientID: CLIENT_ID,
      issuer: urls.api,
      // Token calls go over the private network; the API rewrites them onto its public URL.
      fetch: (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        return fetch(new URL(url.pathname + url.search, urls.apiInternal), init);
      },
    });
    const callbackUrl = `${urls.web}/api/auth/callback`;
    const cookieOptions = { path: "/", httpOnly: true, sameSite: "lax", secure: urls.secure } as const;

    const setTokens = (tokens: Tokens) =>
      RequestContext.pipe(
        Effect.map((req) => {
          req.setCookie(ACCESS_COOKIE, tokens.access, { ...cookieOptions, maxAge: TOKEN_MAX_AGE });
          req.setCookie(REFRESH_COOKIE, tokens.refresh, { ...cookieOptions, maxAge: TOKEN_MAX_AGE });
        }),
      );

    const clearTokens = RequestContext.pipe(
      Effect.map((req) => {
        req.deleteCookie(ACCESS_COOKIE, cookieOptions);
        req.deleteCookie(REFRESH_COOKIE, cookieOptions);
      }),
    );

    /** The theme a signed-out visitor picked, if any. */
    const visitorTheme = RequestContext.pipe(Effect.map((req) => req.getCookie(THEME_COOKIE)));

    /** Remembers the theme a signed-out visitor picked, for a year. */
    const setVisitorTheme = (themeId: string) =>
      RequestContext.pipe(Effect.map((req) => req.setCookie(THEME_COOKIE, themeId, { ...cookieOptions, maxAge: 60 * 60 * 24 * 365 })));

    /** The language this browser picked (a shipped code, checked by the caller), if any. */
    const pickedLanguage = RequestContext.pipe(Effect.map((req) => req.getCookie(LANGUAGE_COOKIE)));

    /** The languages the browser asks for, read only to choose one; never logged or stored. */
    const browserLanguages = RequestContext.pipe(Effect.map((req) => req.request.headers.get("accept-language")));

    /** Remembers a language for a year, or forgets it (null) to follow the browser again. */
    const pickLanguage = (code: string | null) =>
      RequestContext.pipe(
        Effect.map((req) =>
          code === null
            ? req.deleteCookie(LANGUAGE_COOKIE, cookieOptions)
            : req.setCookie(LANGUAGE_COOKIE, code, { ...cookieOptions, maxAge: 60 * 60 * 24 * 365 }),
        ),
      );

    /**
     * Signing in hands the theme picked while signed out to the account, if the
     * account still wears the default (as every new one does). The account decides from then on.
     */
    const handOffVisitorTheme = (accessToken: string) =>
      Effect.gen(function* () {
        const req = yield* RequestContext;
        const themeId = req.getCookie(THEME_COOKIE);
        if (!themeId) return;
        req.deleteCookie(THEME_COOKIE, cookieOptions);
        const client = yield* api.as(accessToken);
        const user = yield* client.me.get();
        if (user.themeId === DEFAULT_THEME.id) yield* client.me.wear({ payload: { themeId } });
      }).pipe(Effect.catchAll((error) => Effect.logWarning("handing the signed-out theme to the account failed", error)));

    /** Starts a sign-in: the URL to send the browser to, remembering state for the callback. */
    const authorize = (next: string) =>
      Effect.gen(function* () {
        const { challenge, url } = yield* Effect.promise(() => client.authorize(callbackUrl, "code", { provider: "github", pkce: true }));
        const value = JSON.stringify({ state: challenge.state, verifier: challenge.verifier, next });
        (yield* RequestContext).setCookie(LOGIN_COOKIE, value, { ...cookieOptions, path: "/api/auth", maxAge: 600 });
        return url;
      });

    /** Finishes a sign-in: checks the state, trades the code for tokens, returns where to go next. */
    const callback = (params: URLSearchParams) =>
      Effect.gen(function* () {
        const error = params.get("error_description") ?? params.get("error");
        if (error) return yield* new OpenAuthError({ reason: error });
        const req = yield* RequestContext;
        const login = parseLogin(req.getCookie(LOGIN_COOKIE));
        req.deleteCookie(LOGIN_COOKIE, { ...cookieOptions, path: "/api/auth" });
        const code = params.get("code");
        if (!code || !login.state || login.state !== params.get("state")) {
          return yield* new OpenAuthError({ reason: "the login link expired or was tampered with. Please try again." });
        }
        const exchanged = yield* Effect.promise(() => client.exchange(code, callbackUrl, login.verifier));
        if (exchanged.err) return yield* new OpenAuthError({ reason: "the sign-in code was rejected. Please try again." });
        yield* setTokens(exchanged.tokens);
        yield* handOffVisitorTheme(exchanged.tokens.access);
        return safeNext(login.next);
      });

    // One refresh per request, however many loaders and server functions ask.
    const perRequest = new WeakMap<Request, Promise<Option.Option<string>>>();

    /**
     * The access token for this request, refreshed first if it has expired.
     * None when signed out (or when the refresh token was revoked).
     */
    const resolveAccessToken: Effect.Effect<Option.Option<string>, never, RequestContext> = Effect.gen(function* () {
      const req = yield* RequestContext;
      const access = req.getCookie(ACCESS_COOKIE);
      const refresh = req.getCookie(REFRESH_COOKIE);
      if (access && !expiresSoon(access)) return Option.some(access);
      if (!refresh) return Option.none();
      const refreshed = yield* Effect.tryPromise(() => client.refresh(refresh));
      if (refreshed.err || !refreshed.tokens) {
        yield* clearTokens;
        return Option.none();
      }
      yield* setTokens(refreshed.tokens);
      return Option.some(refreshed.tokens.access);
    }).pipe(
      // The API couldn't be reached: keep the cookies so a hiccup doesn't sign anyone out.
      Effect.catchAll((error) => Effect.logWarning("token refresh failed", error).pipe(Effect.as(Option.none<string>()))),
    );

    const accessToken = Effect.gen(function* () {
      const req = yield* RequestContext;
      let pending = perRequest.get(req.request);
      if (!pending) {
        pending = Effect.runPromise(Effect.provideService(resolveAccessToken, RequestContext, req));
        perRequest.set(req.request, pending);
      }
      return yield* Effect.promise(() => pending);
    });

    /** The signed-in user for this request, if any. */
    const currentUser: Effect.Effect<Option.Option<User>, never, RequestContext> = accessToken.pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeedNone,
          onSome: (token) =>
            api.as(token).pipe(
              Effect.flatMap((client) => client.me.get()),
              Effect.map(Option.some),
              Effect.catchAll(() => Effect.succeedNone),
            ),
        }),
      ),
    );

    /** Signs out: revokes the refresh token at the API and clears the cookies. */
    const signOut = Effect.gen(function* () {
      const refresh = (yield* RequestContext).getCookie(REFRESH_COOKIE);
      if (refresh) yield* api.anonymous.session.revoke({ payload: { refreshToken: refresh } }).pipe(Effect.ignoreLogged);
      yield* clearTokens;
    });

    return { authorize, callback, accessToken, currentUser, visitorTheme, setVisitorTheme, pickedLanguage, browserLanguages, pickLanguage, signOut } as const;
  }),
  dependencies: [Urls.Default, ApiClient.Default],
}) {}

/** Only same-site relative paths, so `next` can't be used as an open redirect. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/settings";
}

function parseLogin(value: string | undefined): { state?: string; verifier?: string; next?: string } {
  try {
    return JSON.parse(value ?? "");
  } catch {
    return {};
  }
}

/** True when a JWT's `exp` is under 30 seconds away (or unreadable). */
function expiresSoon(token: string): boolean {
  const body = token.split(".")[1];
  if (!body) return true;
  try {
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof payload.exp !== "number" || payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}
