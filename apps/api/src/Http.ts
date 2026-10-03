import { HttpApiBuilder, HttpApiError } from "@effect/platform";
import { Api, CurrentUser, GithubUnavailable, type ImageKind, ImageRejected, LinkedUser, Viewer } from "@waifu-devs/domain/api";
import { MAX_IMAGE_BYTES } from "@waifu-devs/domain/profile";
import { Config, Effect, Layer, Option } from "effect";
import { MediaStore, newKey, processImage } from "./Media.ts";
import { GithubError } from "./Github.ts";
import { Posts } from "./Posts.ts";
import { Repos } from "./Repos.ts";
import { revokeRefreshToken } from "./Storage.ts";
import { Themes } from "./Themes.ts";
import { Users } from "./Users.ts";

// Database failures are bugs or outages, not API errors: they become 500s.
const orNotFound = <A, E, R>(effect: Effect.Effect<Option.Option<A>, E, R>) =>
  effect.pipe(Effect.orDie, Effect.flatMap(Option.match({ onNone: () => Effect.fail(new HttpApiError.NotFound()), onSome: Effect.succeed })));

/** GitHub being unreachable is for the member to retry later; anything else is a 500. */
const githubOrDie = <A, E, R>(effect: Effect.Effect<A, E | GithubError, R>) =>
  effect.pipe(
    Effect.catchAll((error) => (error instanceof GithubError ? Effect.fail(new GithubUnavailable()) : Effect.die(error))),
  );

const UsersLive = HttpApiBuilder.group(Api, "users", (handlers) =>
  Effect.gen(function* () {
    const users = yield* Users;
    const themes = yield* Themes;
    const repos = yield* Repos;
    return handlers
      .handle("list", ({ urlParams }) => Effect.orDie(users.list(urlParams.limit ?? 60)))
      .handle("byUsername", ({ path }) => orNotFound(users.byUsername(path.username)))
      .handle("themes", ({ path }) =>
        orNotFound(users.byUsername(path.username)).pipe(
          Effect.flatMap((user) => Effect.orDie(themes.byOwner(user.id, { includePrivate: false }))),
        ),
      )
      .handle("repos", ({ path }) =>
        orNotFound(users.byUsername(path.username)).pipe(Effect.flatMap((user) => Effect.orDie(repos.forUser(user.id)))),
      )
      .handle("stats", () => Effect.orDie(users.count).pipe(Effect.map((members) => ({ members }))));
  }),
);

const MeLive = HttpApiBuilder.group(Api, "me", (handlers) =>
  Effect.gen(function* () {
    const users = yield* Users;
    const themes = yield* Themes;
    const repos = yield* Repos;
    const media = yield* MediaStore;

    /** Points the avatar or banner at `key` (or none), then deletes the picture it replaced. */
    const setImage = (userId: string, kind: ImageKind, key: string | null) =>
      Effect.orDie(users.setImage(userId, kind, key)).pipe(
        Effect.tap(({ previous }) => (previous ? media.remove(previous) : Effect.void)),
        Effect.map(({ user }) => user),
      );

    return handlers
      .handle("get", () => CurrentUser)
      .handle("update", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser;
          // A profile can be shown in any theme its owner could wear.
          const themeId = payload.profileThemeId;
          if (themeId && !(yield* Effect.orDie(themes.canWear(me.id, themeId)))) return yield* new HttpApiError.Forbidden();
          return yield* Effect.orDie(users.update(me.id, payload));
        }),
      )
      .handle("wear", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser;
          if (!(yield* Effect.orDie(themes.canWear(me.id, payload.themeId)))) return yield* new HttpApiError.Forbidden();
          return yield* Effect.orDie(users.update(me.id, { themeId: payload.themeId }));
        }),
      )
      .handle("themes", () => CurrentUser.pipe(Effect.flatMap((me) => Effect.orDie(themes.byOwner(me.id, { includePrivate: true })))))
      .handle("uploadImage", ({ path, payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser;
          if (payload.byteLength > MAX_IMAGE_BYTES) {
            return yield* new ImageRejected({ reason: `That file is over ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` });
          }
          const webp = yield* processImage(path.kind, payload);
          const key = newKey(path.kind, me.id);
          yield* Effect.orDie(media.put(key, webp));
          return yield* setImage(me.id, path.kind, key);
        }),
      )
      .handle("removeImage", ({ path }) => CurrentUser.pipe(Effect.flatMap((me) => setImage(me.id, path.kind, null))))
      .handle("repoChoices", () => CurrentUser.pipe(Effect.flatMap((me) => githubOrDie(repos.choices(me.username)))))
      .handle("featureRepos", ({ payload }) => CurrentUser.pipe(Effect.flatMap((me) => githubOrDie(repos.feature(me, payload.ids)))));
  }),
);

const ThemesLive = HttpApiBuilder.group(Api, "themes", (handlers) =>
  Effect.gen(function* () {
    const themes = yield* Themes;
    return handlers
      .handle("community", () => Effect.orDie(themes.community()))
      .handle("get", ({ path }) => orNotFound(themes.get(path.id)))
      .handle("create", ({ payload }) => CurrentUser.pipe(Effect.flatMap((me) => Effect.orDie(themes.create(me, payload)))))
      .handle("delete", ({ path }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser;
          if (!(yield* Effect.orDie(themes.remove(me.id, path.id)))) return yield* new HttpApiError.NotFound();
        }),
      );
  }),
);

const PostsLive = HttpApiBuilder.group(Api, "posts", (handlers) =>
  Effect.gen(function* () {
    const posts = yield* Posts;
    const viewerId = Viewer.pipe(Effect.map((viewer) => Option.getOrNull(Option.map(viewer, (user) => user.id))));

    const vote = (id: string, up: boolean) =>
      Effect.gen(function* () {
        const me = yield* CurrentUser;
        // Your own post already carries your vote, and it stays.
        if ((yield* orNotFound(posts.authorOf(id))) === me.id) return yield* new HttpApiError.Forbidden();
        return yield* Effect.orDie(posts.vote(me.id, id, up));
      });

    return handlers
      .handle("list", ({ urlParams }) =>
        viewerId.pipe(Effect.flatMap((viewerId) => Effect.orDie(posts.list({ sort: urlParams.sort ?? "top", page: urlParams.page ?? 1, viewerId })))),
      )
      .handle("get", ({ path }) => viewerId.pipe(Effect.flatMap((viewerId) => orNotFound(posts.get(path.id, viewerId)))))
      .handle("create", ({ payload }) => CurrentUser.pipe(Effect.flatMap((me) => Effect.orDie(posts.create(me, payload)))))
      .handle("delete", ({ path }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser;
          if (!(yield* Effect.orDie(posts.remove(me.id, path.id)))) return yield* new HttpApiError.NotFound();
        }),
      )
      .handle("upvote", ({ path }) => vote(path.id, true))
      .handle("unvote", ({ path }) => vote(path.id, false))
      .handle("comment", ({ path, payload }) => CurrentUser.pipe(Effect.flatMap((me) => orNotFound(posts.comment(me, path.id, payload)))));
  }),
);

/** Who signed in, for a fuwa instance that signed them in with waifu.dev. */
const LinkedLive = HttpApiBuilder.group(Api, "linked", (handlers) =>
  Effect.gen(function* () {
    const webUrl = yield* Config.string("WEB_URL");
    return handlers.handle("userinfo", () =>
      LinkedUser.pipe(
        Effect.map((user) => ({
          sub: user.id,
          preferred_username: user.username,
          name: user.displayName || user.username,
          picture: user.avatarUrl,
          profile: new URL(`/u/${user.username}`, webUrl).href,
        })),
      ),
    );
  }),
);

const SessionLive = HttpApiBuilder.group(Api, "session", (handlers) =>
  handlers.handle("revoke", ({ payload }) => Effect.orDie(revokeRefreshToken(payload.refreshToken))),
);

export const HttpLive = HttpApiBuilder.api(Api).pipe(Layer.provide([UsersLive, MeLive, ThemesLive, PostsLive, SessionLive, LinkedLive]));
