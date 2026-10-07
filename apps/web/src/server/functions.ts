/**
 * Server functions: every read and write the pages do, as Effects against the API.
 * They run on the server only; the client calls them over RPC.
 */
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { NewTheme, ProfileUpdate, Repo, Theme, User } from "@waifu-devs/domain/api";
import {
  BANNERS,
  type Banner,
  DEFAULT_BANNER,
  IMAGE_KINDS,
  type ImageKind,
  MAX_FEATURED_REPOS,
  MAX_IMAGE_BYTES,
  MAX_LINK_LENGTH,
  MAX_LINKS,
  MAX_SKILL_LENGTH,
  MAX_SKILLS,
} from "@waifu-devs/domain/profile";
import { isCountryCode } from "@waifu-devs/domain/countries";
import { BUILTIN_THEMES, DEFAULT_THEME, TOKENS } from "@waifu-devs/domain/themes";
import { Effect, Option, Schema } from "effect";
import { CODES, languageOf, shipped } from "../i18n/catalogs.ts";
import { acceptLanguage, negotiate } from "../i18n/core.ts";
import { ApiClient } from "./Api.ts";
import { asUser, formData, orNotFound, text } from "./helpers.ts";
import { run } from "./runtime.ts";
import { Session } from "./Session.ts";

const isUuid = Schema.is(Schema.UUID);

/** A built-in theme, or a member's theme from the API; the default if it's gone. */
const resolveTheme = (id: string | null | undefined) =>
  Effect.gen(function* () {
    const builtin = BUILTIN_THEMES.find((t) => t.id === (id ?? DEFAULT_THEME.id));
    if (builtin) return builtin as Theme;
    const api = yield* ApiClient;
    return yield* api.anonymous.themes.get({ path: { id: id! } }).pipe(Effect.orElseSucceed(() => DEFAULT_THEME as Theme));
  });

/** A theme anyone may wear, signed in or not: a built-in, or a member's theme that's public. */
const publicTheme = (id: string | undefined) =>
  Effect.gen(function* () {
    const builtin = BUILTIN_THEMES.find((t) => t.id === id);
    if (builtin) return Option.some(builtin as Theme);
    // Members' themes have UUIDs, and the id goes into the API path, so nothing else gets that far.
    if (!id || !isUuid(id)) return Option.none<Theme>();
    const theme = yield* (yield* ApiClient).anonymous.themes.get({ path: { id } }).pipe(Effect.option);
    return Option.filter(theme, (t) => t.isPublic !== false);
  });

/** A member's featured repos. A profile still shows without them if they can't be had. */
const featuredRepos = (username: string) =>
  ApiClient.pipe(
    Effect.flatMap((api) => api.anonymous.users.repos({ path: { username } })),
    Effect.orElseSucceed((): readonly Repo[] => []),
  );

/**
 * Which language to show: the one this browser picked, else the best match for
 * the languages it asks for, else English. Only shipped codes come out, so the
 * value is safe for <html lang> and the cookie.
 */
const viewerLanguage = Effect.gen(function* () {
  const session = yield* Session;
  const picked = yield* session.pickedLanguage;
  const detected = negotiate(acceptLanguage(yield* session.browserLanguages), CODES);
  const active = picked && CODES.includes(picked) ? picked : detected;
  return { choice: picked && CODES.includes(picked) ? picked : "auto", detected, active, dir: languageOf(active).dir };
});

/** The signed-in user, or a redirect to /login that comes back to `next`. */
const requireUser = (next: string) =>
  Session.pipe(
    Effect.flatMap((session) => session.currentUser),
    Effect.flatMap(Option.match({ onNone: () => Effect.die(redirect({ to: "/login", search: { next } })), onSome: Effect.succeed })),
  );

// ---------------------------------------------------------------------------
// Reads

/** Who is looking, and which theme to dress the site in for them. */
export const getViewer = createServerFn({ method: "GET" }).handler(() =>
  run(
    Effect.gen(function* () {
      const session = yield* Session;
      const user = Option.getOrNull(yield* session.currentUser);
      // Signed out, it's the theme this browser picked, as long as anyone may still wear it.
      const theme = user
        ? yield* resolveTheme(user.themeId)
        : Option.getOrElse(yield* publicTheme(yield* session.visitorTheme), () => DEFAULT_THEME as Theme);
      return { user, theme, language: yield* viewerLanguage };
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

export const getProfile = createServerFn({ method: "GET" })
  .validator((username: string) => username)
  .handler(({ data: username }) =>
    run(
      Effect.gen(function* () {
        const api = yield* ApiClient;
        const user = yield* orNotFound(api.anonymous.users.byUsername({ path: { username } }));
        const viewer = Option.getOrNull(yield* (yield* Session).currentUser);
        const isMe = viewer?.id === user.id;
        const [theme, themes, repos] = yield* Effect.all(
          [
            // Everyone sees the profile in the theme its owner picked for it.
            resolveTheme(user.profileThemeId ?? user.themeId),
            isMe ? asUser.pipe(Effect.flatMap((me) => me.me.themes())) : api.anonymous.users.themes({ path: { username } }),
            featuredRepos(user.username),
          ],
          { concurrency: "unbounded" },
        );
        return { user, theme, themes, repos, isMe };
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

/** The profile editor: the signed-in user, the theme they wear, and every theme their profile can use. */
export const getProfileEditor = createServerFn({ method: "GET" }).handler(() =>
  run(
    Effect.gen(function* () {
      const user = yield* requireUser("/settings");
      const api = yield* ApiClient;
      const [worn, profile, mine, gallery, repos] = yield* Effect.all(
        [
          resolveTheme(user.themeId),
          user.profileThemeId ? resolveTheme(user.profileThemeId) : Effect.succeed(null),
          asUser.pipe(Effect.flatMap((me) => me.me.themes())),
          api.anonymous.themes.community(),
          featuredRepos(user.username),
        ],
        { concurrency: "unbounded" },
      );
      // Other members' public themes, plus the current profile theme if the gallery doesn't list it.
      const mineIds = new Set(mine.map((t) => t.id));
      const community = [...gallery, ...(profile && !profile.builtin ? [profile] : [])].filter(
        (t, i, all) => !mineIds.has(t.id) && all.findIndex((other) => other.id === t.id) === i,
      );
      return { user, worn, mine, builtin: BUILTIN_THEMES as Theme[], community, repos };
    }),
  ),
);

const GITHUB_DOWN = "GitHub isn't answering right now. Try again in a minute.";

/** Every public repo the signed-in member could feature, for the picker; it asks GitHub, so it loads after the page. */
export const getRepoChoices = createServerFn({ method: "GET" }).handler(() =>
  run(
    asUser.pipe(
      Effect.flatMap((me) => me.me.repoChoices()),
      Effect.map((repos) => ({ repos, error: null })),
      Effect.catchTag("GithubUnavailable", () => Effect.succeed({ repos: [] as readonly Repo[], error: GITHUB_DOWN })),
    ),
  ),
);

// ---------------------------------------------------------------------------
// Writes (forms post FormData)

function url(form: FormData, key: string): string | null {
  return toUrl(text(form, key, 200));
}

/** An http(s) URL, adding https:// when it was left off; null if it isn't one. */
function toUrl(value: string | null): string | null {
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    const href = parsed.toString();
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && href.length <= MAX_LINK_LENGTH ? href : null;
  } catch {
    return null;
  }
}

/** The values of a repeated field, trimmed and normalized, without empties or case-insensitive duplicates. */
function list(form: FormData, key: string, max: number, normalize: (value: string) => string | null): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const value of form.getAll(key)) {
    const normalized = typeof value === "string" ? normalize(value.trim()) : null;
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    values.push(normalized);
  }
  return values.slice(0, max);
}

export const updateProfile = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(
      Effect.gen(function* () {
        const banner = form.get("banner");
        const payload: ProfileUpdate = {
          displayName: text(form, "display_name", 60),
          bio: text(form, "bio", 500),
          pronouns: text(form, "pronouns", 30),
          website: url(form, "website"),
          favoriteWaifu: text(form, "favorite_waifu", 80),
          status: text(form, "status", 80),
          location: text(form, "location", 60),
          country: isCountryCode(form.get("country")) ? (form.get("country") as string) : null,
          showCountry: form.get("show_country") === "on",
          skills: list(form, "skill", MAX_SKILLS, (skill) => skill.slice(0, MAX_SKILL_LENGTH) || null),
          links: list(form, "link", MAX_LINKS, toUrl),
          banner: BANNERS.includes(banner as Banner) ? (banner as Banner) : DEFAULT_BANNER,
          // Empty means "the theme I wear".
          profileThemeId: text(form, "profile_theme_id", 64),
        };
        const me = yield* asUser;
        // Featured repos go first: they're the part that can fail (GitHub vets new ones),
        // and if they do, nothing is saved, so the editor keeps every change for another try.
        if (form.has("featured_repos")) {
          const ids = form
            .getAll("repo")
            .map(Number)
            .filter(Number.isSafeInteger)
            .slice(0, MAX_FEATURED_REPOS);
          const featured = yield* me.me.featureRepos({ payload: { ids } }).pipe(
            Effect.as(true),
            Effect.catchTag("GithubUnavailable", () => Effect.succeed(false)),
          );
          if (!featured) return { error: GITHUB_DOWN };
        }
        const user: User = yield* me.me.update({ payload });
        return yield* Effect.die(redirect({ to: "/u/$username", params: { username: user.username } }));
      }),
    ),
  );

const imageKind = (form: FormData): ImageKind | null => {
  const kind = form.get("kind");
  return IMAGE_KINDS.find((k) => k === kind) ?? null;
};

/** Uploads a new profile picture or banner. Resolves to why the API refused it, if it did. */
export const uploadImage = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(
      Effect.gen(function* () {
        const kind = imageKind(form);
        const file = form.get("file");
        if (!kind || !(file instanceof File)) return { error: "Pick an image to upload." };
        if (file.size > MAX_IMAGE_BYTES) return { error: `That file is over ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` };
        const payload = new Uint8Array(yield* Effect.promise(() => file.arrayBuffer()));
        return yield* (yield* asUser).me.uploadImage({ path: { kind }, payload }).pipe(
          Effect.as({ error: null }),
          Effect.catchTag("ImageRejected", (rejected) => Effect.succeed({ error: rejected.reason })),
        );
      }),
    ),
  );

/** Goes back to the GitHub avatar, or takes the picture off the banner (its decoration stays). */
export const removeImage = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(
      Effect.gen(function* () {
        const kind = imageKind(form);
        if (kind) yield* (yield* asUser).me.removeImage({ path: { kind } });
      }),
    ),
  );

/** Members wear a theme on their account; signed out, this browser remembers it. */
export const wearTheme = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(
      Effect.gen(function* () {
        const themeId = text(form, "theme_id", 64) ?? "";
        const session = yield* Session;
        const token = yield* session.accessToken;
        if (Option.isSome(token)) {
          yield* (yield* ApiClient).as(token.value).pipe(Effect.flatMap((me) => me.me.wear({ payload: { themeId } })));
        } else if (Option.isSome(yield* publicTheme(themeId))) {
          yield* session.setVisitorTheme(themeId);
        }
      }),
    ),
  );

/** Picks the site's language for this browser, or "auto" to follow the browser's own. */
export const pickLanguage = createServerFn({ method: "POST" })
  .validator((code: unknown) => (typeof code === "string" && (code === "auto" || CODES.includes(code)) ? code : "auto"))
  .handler(({ data: code }) =>
    run(
      Effect.gen(function* () {
        yield* (yield* Session).pickLanguage(code === "auto" ? null : shipped(code));
      }),
    ),
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
        const theme = yield* (yield* asUser).themes.create({ payload });
        return yield* Effect.die(redirect({ to: "/themes/$themeId", params: { themeId: theme.id } }));
      }),
    ),
  );

/** Deletes one of your themes; from the theme's own page (`leave`), goes back to the marketplace. */
export const deleteTheme = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(
      Effect.gen(function* () {
        yield* asUser.pipe(Effect.flatMap((me) => me.themes.delete({ path: { id: text(form, "theme_id", 64) ?? "" } })), Effect.ignore);
        if (form.has("leave")) return yield* Effect.die(redirect({ to: "/themes" }));
      }),
    ),
  );

export const signOut = createServerFn({ method: "POST" }).handler(() =>
  run(
    Effect.gen(function* () {
      yield* (yield* Session).signOut;
      return yield* Effect.die(redirect({ to: "/" }));
    }),
  ),
);
