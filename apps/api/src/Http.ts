import { HttpApiBuilder, HttpApiError } from "@effect/platform";
import { Api, CurrentUser } from "@waifu-devs/domain/api";
import { Effect, Layer, Option } from "effect";
import { revokeRefreshToken } from "./Storage.ts";
import { Themes } from "./Themes.ts";
import { Users } from "./Users.ts";

// Database failures are bugs or outages, not API errors: they become 500s.
const orNotFound = <A, E, R>(effect: Effect.Effect<Option.Option<A>, E, R>) =>
  effect.pipe(Effect.orDie, Effect.flatMap(Option.match({ onNone: () => Effect.fail(new HttpApiError.NotFound()), onSome: Effect.succeed })));

const UsersLive = HttpApiBuilder.group(Api, "users", (handlers) =>
  Effect.gen(function* () {
    const users = yield* Users;
    const themes = yield* Themes;
    return handlers
      .handle("list", ({ urlParams }) => Effect.orDie(users.list(urlParams.limit ?? 60)))
      .handle("byUsername", ({ path }) => orNotFound(users.byUsername(path.username)))
      .handle("themes", ({ path }) =>
        orNotFound(users.byUsername(path.username)).pipe(
          Effect.flatMap((user) => Effect.orDie(themes.byOwner(user.id, { includePrivate: false }))),
        ),
      )
      .handle("stats", () => Effect.orDie(users.count).pipe(Effect.map((members) => ({ members }))));
  }),
);

const MeLive = HttpApiBuilder.group(Api, "me", (handlers) =>
  Effect.gen(function* () {
    const users = yield* Users;
    const themes = yield* Themes;
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
      .handle("themes", () => CurrentUser.pipe(Effect.flatMap((me) => Effect.orDie(themes.byOwner(me.id, { includePrivate: true })))));
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

const SessionLive = HttpApiBuilder.group(Api, "session", (handlers) =>
  handlers.handle("revoke", ({ payload }) => Effect.orDie(revokeRefreshToken(payload.refreshToken))),
);

export const HttpLive = HttpApiBuilder.api(Api).pipe(Layer.provide([UsersLive, MeLive, ThemesLive, SessionLive]));
