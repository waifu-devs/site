/**
 * Server functions: every read and write the pages do, as Effects against the API.
 * They run on the server only; the client calls them over RPC.
 */
import { notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { NewTheme, ProfileUpdate, Theme, User } from "@waifu-devs/domain/api";
import { BUILTIN_THEMES, DEFAULT_THEME, TOKENS } from "@waifu-devs/domain/themes";
import { Effect, Option } from "effect";
import { ApiClient } from "./Api.ts";
import { run } from "./runtime.ts";
import { Session } from "./Session.ts";

/** A built-in theme, or a member's theme from the API; the default if it's gone. */
const resolveTheme = (id: string | null | undefined) =>
  Effect.gen(function* () {
    const builtin = BUILTIN_THEMES.find((t) => t.id === (id ?? DEFAULT_THEME.id));
    if (builtin) return builtin as Theme;
    const api = yield* ApiClient;
    return yield* api.anonymous.themes.get({ path: { id: id! } }).pipe(Effect.orElseSucceed(() => DEFAULT_THEME as Theme));
  });

/** The signed-in user, or a redirect to /login that comes back to `next`. */
const requireUser = (next: string) =>
  Session.pipe(
    Effect.flatMap((session) => session.currentUser),
    Effect.flatMap(Option.match({ onNone: () => Effect.die(redirect({ to: "/login", search: { next } })), onSome: Effect.succeed })),
  );

/** An API client acting as the signed-in user. */
const asUser = Effect.gen(function* () {
  const session = yield* Session;
  const token = yield* session.accessToken;
  if (Option.isNone(token)) return yield* Effect.die(redirect({ to: "/login" }));
  return yield* (yield* ApiClient).as(token.value);
});

const orNotFound = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.catchAll(() => Effect.die(notFound())));

// ---------------------------------------------------------------------------
// Reads

/** Who is looking, and which theme to dress the site in for them. */
export const getViewer = createServerFn({ method: "GET" }).handler(() =>
  run(
    Effect.gen(function* () {
      const user = Option.getOrNull(yield* (yield* Session).currentUser);
      return { user, theme: yield* resolveTheme(user?.themeId) };
    }),
  ),
);

export const getHome = createServerFn({ method: "GET" }).handler(() =>
  run(
    ApiClient.pipe(
      Effect.flatMap((api) => api.anonymous.users.stats()),
      Effect.map((stats) => ({ memberCount: stats.members })),
    ),
  ),
);

export const getMembers = createServerFn({ method: "GET" }).handler(() =>
  run(ApiClient.pipe(Effect.flatMap((api) => api.anonymous.users.list({ urlParams: { limit: 200 } })))),
);

export const getThemes = createServerFn({ method: "GET" }).handler(() =>
  run(
    Effect.gen(function* () {
      const api = yield* ApiClient;
      const user = Option.getOrNull(yield* (yield* Session).currentUser);
      const [community, mine] = yield* Effect.all(
        [api.anonymous.themes.community(), user ? asUser.pipe(Effect.flatMap((me) => me.me.themes())) : Effect.succeed([])],
        { concurrency: "unbounded" },
      );
      return { user, community, mine };
    }),
  ),
);

export const getProfile = createServerFn({ method: "GET" })
  .validator((username: string) => username)
  .handler(({ data: username }) =>
    run(
      Effect.gen(function* () {
        const api = yield* ApiClient;
        const user = yield* orNotFound(api.anonymous.users.byUsername({ path: { username } }));
        const viewer = Option.getOrNull(yield* (yield* Session).currentUser);
        const isMe = viewer?.id === user.id;
        const [theme, themes] = yield* Effect.all(
          [
            resolveTheme(user.themeId),
            isMe ? asUser.pipe(Effect.flatMap((me) => me.me.themes())) : api.anonymous.users.themes({ path: { username } }),
          ],
          { concurrency: "unbounded" },
        );
        return { user, theme, themes, isMe };
      }),
    ),
  );

/** The signed-in user and what they're wearing, for pages that need an account. */
export const getAccount = createServerFn({ method: "GET" })
  .validator((next: string) => next)
  .handler(({ data: next }) =>
    run(
      Effect.gen(function* () {
        const user = yield* requireUser(next);
        return { user, theme: yield* resolveTheme(user.themeId) };
      }),
    ),
  );

// ---------------------------------------------------------------------------
// Writes (forms post FormData)

const formData = (data: unknown) => {
  if (!(data instanceof FormData)) throw new Error("Expected form data");
  return data;
};

function text(form: FormData, key: string, max: number): string | null {
  const value = form.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

function url(form: FormData, key: string): string | null {
  const value = text(form, key, 200);
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export const updateProfile = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(
      Effect.gen(function* () {
        const payload: ProfileUpdate = {
          displayName: text(form, "display_name", 60),
          bio: text(form, "bio", 500),
          pronouns: text(form, "pronouns", 30),
          website: url(form, "website"),
          favoriteWaifu: text(form, "favorite_waifu", 80),
        };
        const user: User = yield* (yield* asUser).me.update({ payload });
        return yield* Effect.die(redirect({ to: "/u/$username", params: { username: user.username } }));
      }),
    ),
  );

export const wearTheme = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(asUser.pipe(Effect.flatMap((me) => me.me.wear({ payload: { themeId: text(form, "theme_id", 64) ?? "" } })), Effect.asVoid)),
  );

export const createTheme = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(
      Effect.gen(function* () {
        const payload: NewTheme = {
          name: text(form, "name", 40) ?? "",
          description: text(form, "description", 140),
          variant: {
            tokens: Object.fromEntries(TOKENS.map((k) => [k, String(form.get(k) ?? "")])) as NewTheme["variant"]["tokens"],
            radius: Math.round(Number(form.get("radius")) * 8) / 8,
          },
          isPublic: form.get("is_public") !== null,
        };
        yield* (yield* asUser).themes.create({ payload });
        return yield* Effect.die(redirect({ to: "/themes" }));
      }),
    ),
  );

export const deleteTheme = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(asUser.pipe(Effect.flatMap((me) => me.themes.delete({ path: { id: text(form, "theme_id", 64) ?? "" } })), Effect.ignore)),
  );

export const signOut = createServerFn({ method: "POST" }).handler(() =>
  run(
    Effect.gen(function* () {
      yield* (yield* Session).signOut;
      return yield* Effect.die(redirect({ to: "/" }));
    }),
  ),
);
