/**
 * The API contract shared by apps/api (which implements it) and apps/web
 * (which calls it through a typed HttpApiClient).
 */
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiMiddleware, HttpApiSecurity } from "@effect/platform";
import { Context, Schema } from "effect";
import { HEX, RADIUS_MAX, RADIUS_MIN, TOKENS } from "./themes.ts";

// ---------------------------------------------------------------------------
// Themes

/** A #rrggbb color, normalized to lowercase. */
export const Hex = Schema.Lowercase.pipe(Schema.compose(Schema.String.pipe(Schema.pattern(HEX))), Schema.annotations({ identifier: "Hex" }));

/** A full shadcn token set plus corner radius (rem). */
export const ThemeVariant = Schema.Struct({
  tokens: Schema.Record({ key: Schema.Literal(...TOKENS), value: Hex }),
  radius: Schema.Number.pipe(Schema.between(RADIUS_MIN, RADIUS_MAX)),
});
export type ThemeVariant = typeof ThemeVariant.Type;

export const Theme = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  variant: ThemeVariant,
  builtin: Schema.Boolean,
  isPublic: Schema.optional(Schema.Boolean),
  ownerUsername: Schema.optional(Schema.String),
});
export type Theme = typeof Theme.Type;

export const NewTheme = Schema.Struct({
  name: Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(40)),
  description: Schema.NullOr(Schema.Trim.pipe(Schema.maxLength(140))),
  variant: ThemeVariant,
  isPublic: Schema.Boolean,
});
export type NewTheme = typeof NewTheme.Type;

// ---------------------------------------------------------------------------
// Users

export const User = Schema.Struct({
  id: Schema.UUID,
  username: Schema.String,
  displayName: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
  bio: Schema.NullOr(Schema.String),
  pronouns: Schema.NullOr(Schema.String),
  website: Schema.NullOr(Schema.String),
  favoriteWaifu: Schema.NullOr(Schema.String),
  themeId: Schema.String,
  createdAt: Schema.Date,
});
export type User = typeof User.Type;

const optionalText = (max: number) => Schema.NullOr(Schema.Trim.pipe(Schema.maxLength(max)));

export const ProfileUpdate = Schema.Struct({
  displayName: optionalText(60),
  bio: optionalText(500),
  pronouns: optionalText(30),
  website: Schema.NullOr(Schema.String.pipe(Schema.maxLength(200), Schema.pattern(/^https?:\/\/\S+$/))),
  favoriteWaifu: optionalText(80),
});
export type ProfileUpdate = typeof ProfileUpdate.Type;

// ---------------------------------------------------------------------------
// Authentication: an OpenAuth access token, sent as a bearer token.

export class CurrentUser extends Context.Tag("CurrentUser")<CurrentUser, User>() {}

export class Authentication extends HttpApiMiddleware.Tag<Authentication>()("Authentication", {
  failure: HttpApiError.Unauthorized,
  provides: CurrentUser,
  security: { bearer: HttpApiSecurity.bearer },
}) {}

// ---------------------------------------------------------------------------
// Endpoints

const Username = Schema.Struct({ username: Schema.String });
const ThemeId = Schema.Struct({ id: Schema.String });

export class UsersApi extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("list", "/users")
      .setUrlParams(Schema.Struct({ limit: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 200))) }))
      .addSuccess(Schema.Array(User)),
  )
  .add(HttpApiEndpoint.get("byUsername", "/users/:username").setPath(Username).addSuccess(User).addError(HttpApiError.NotFound))
  .add(
    HttpApiEndpoint.get("themes", "/users/:username/themes")
      .setPath(Username)
      .addSuccess(Schema.Array(Theme))
      .addError(HttpApiError.NotFound),
  )
  .add(HttpApiEndpoint.get("stats", "/stats").addSuccess(Schema.Struct({ members: Schema.Number }))) {}

export class MeApi extends HttpApiGroup.make("me")
  .add(HttpApiEndpoint.get("get", "/me").addSuccess(User))
  .add(HttpApiEndpoint.patch("update", "/me").setPayload(ProfileUpdate).addSuccess(User))
  .add(
    HttpApiEndpoint.put("wear", "/me/theme")
      .setPayload(Schema.Struct({ themeId: Schema.String }))
      .addSuccess(User)
      .addError(HttpApiError.Forbidden),
  )
  .add(HttpApiEndpoint.get("themes", "/me/themes").addSuccess(Schema.Array(Theme)))
  .middleware(Authentication) {}

export class ThemesApi extends HttpApiGroup.make("themes")
  .add(HttpApiEndpoint.get("community", "/themes").addSuccess(Schema.Array(Theme)))
  .add(HttpApiEndpoint.get("get", "/themes/:id").setPath(ThemeId).addSuccess(Theme).addError(HttpApiError.NotFound))
  .add(HttpApiEndpoint.post("create", "/themes").setPayload(NewTheme).addSuccess(Theme).middleware(Authentication))
  .add(HttpApiEndpoint.del("delete", "/themes/:id").setPath(ThemeId).addError(HttpApiError.NotFound).middleware(Authentication)) {}

export class SessionApi extends HttpApiGroup.make("session")
  // Signing out: the refresh token itself is the credential, so no bearer token is needed.
  .add(HttpApiEndpoint.post("revoke", "/session/revoke").setPayload(Schema.Struct({ refreshToken: Schema.String }))) {}

export class Api extends HttpApi.make("waifu-devs").add(UsersApi).add(MeApi).add(ThemesApi).add(SessionApi) {}
