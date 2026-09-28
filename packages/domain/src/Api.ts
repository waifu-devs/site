/**
 * The API contract shared by apps/api (which implements it) and apps/web
 * (which calls it through a typed HttpApiClient).
 */
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, HttpApiSecurity } from "@effect/platform";
import { Context, type Option, Schema } from "effect";
import { isCountryCode } from "./countries.ts";
import { BANNERS, DEFAULT_BANNER, IMAGE_KINDS, MAX_LINK_LENGTH, MAX_LINKS, MAX_SKILL_LENGTH, MAX_SKILLS } from "./profile.ts";
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

export const Banner = Schema.Literal(...BANNERS);

const nullByDefault = Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null });

export const User = Schema.Struct({
  id: Schema.UUID,
  username: Schema.String,
  displayName: Schema.NullOr(Schema.String),
  /** The uploaded picture if there is one, otherwise the GitHub avatar. */
  avatarUrl: Schema.NullOr(Schema.String),
  bio: Schema.NullOr(Schema.String),
  pronouns: Schema.NullOr(Schema.String),
  website: Schema.NullOr(Schema.String),
  favoriteWaifu: Schema.NullOr(Schema.String),
  /** The theme the member browses the site in. */
  themeId: Schema.String,
  createdAt: Schema.Date,
  // Profile customization. These decode with defaults so a web deploy that
  // lands before the API's can still read users.
  /** The theme everyone sees the profile in; null means the one the member wears. */
  profileThemeId: nullByDefault,
  banner: Schema.optionalWith(Banner, { default: () => DEFAULT_BANNER }),
  status: nullByDefault,
  location: nullByDefault,
  /** The member's country as an ISO 3166-1 alpha-2 code. Null unless they show it. */
  country: nullByDefault,
  showCountry: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  skills: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  links: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  /** True when avatarUrl is an uploaded picture rather than the GitHub avatar. */
  customAvatar: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  /** An uploaded banner picture; the banner decoration plays on top of it. */
  bannerUrl: nullByDefault,
});
export type User = typeof User.Type;

export const ImageKind = Schema.Literal(...IMAGE_KINDS);
export type ImageKind = typeof ImageKind.Type;

/** An upload that isn't an image we take, or is too big; `reason` is shown to the member. */
export class ImageRejected extends Schema.TaggedError<ImageRejected>()(
  "ImageRejected",
  { reason: Schema.String },
  HttpApiSchema.annotations({ status: 422 }),
) {}

const optionalText = (max: number) => Schema.NullOr(Schema.Trim.pipe(Schema.maxLength(max)));
const CountryCode = Schema.String.pipe(Schema.filter(isCountryCode, { description: "an ISO 3166-1 alpha-2 country code" }));
const Url = Schema.String.pipe(Schema.maxLength(MAX_LINK_LENGTH), Schema.pattern(/^https?:\/\/\S+$/));

export const ProfileUpdate = Schema.Struct({
  displayName: optionalText(60),
  bio: optionalText(500),
  pronouns: optionalText(30),
  website: Schema.NullOr(Url),
  favoriteWaifu: optionalText(80),
  // Optional so older clients can still save the fields above; a missing field is left as it is.
  status: Schema.optional(optionalText(80)),
  location: Schema.optional(optionalText(60)),
  country: Schema.optional(Schema.NullOr(CountryCode)),
  showCountry: Schema.optional(Schema.Boolean),
  skills: Schema.optional(
    Schema.Array(Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(MAX_SKILL_LENGTH))).pipe(Schema.maxItems(MAX_SKILLS)),
  ),
  links: Schema.optional(Schema.Array(Url).pipe(Schema.maxItems(MAX_LINKS))),
  banner: Schema.optional(Banner),
  profileThemeId: Schema.optional(Schema.NullOr(Schema.String)),
});
export type ProfileUpdate = typeof ProfileUpdate.Type;

// ---------------------------------------------------------------------------
// News: link and text posts, upvotes and threaded comments.

/** The bits of a member shown next to what they wrote. */
export const Byline = Schema.Struct({
  username: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String),
});
export type Byline = typeof Byline.Type;

export const Post = Schema.Struct({
  id: Schema.UUID,
  title: Schema.String,
  url: Schema.NullOr(Schema.String),
  body: Schema.NullOr(Schema.String),
  author: Byline,
  score: Schema.Number,
  commentCount: Schema.Number,
  createdAt: Schema.Date,
  /** Whether the member asking has upvoted it (always false when signed out). */
  voted: Schema.Boolean,
});
export type Post = typeof Post.Type;

export const Comment = Schema.Struct({
  id: Schema.UUID,
  parentId: Schema.NullOr(Schema.UUID),
  body: Schema.String,
  author: Byline,
  createdAt: Schema.Date,
});
export type Comment = typeof Comment.Type;

export const POST_TITLE_MAX = 120;
export const POST_URL_MAX = 2000;
export const POST_BODY_MAX = 10_000;
export const COMMENT_MAX = 5_000;

/** A title, plus a link, some text, or both (like "Ask HN" posts, text alone is fine). */
export const NewPost = Schema.Struct({
  title: Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(POST_TITLE_MAX)),
  url: Schema.NullOr(Schema.String.pipe(Schema.maxLength(POST_URL_MAX), Schema.pattern(/^https?:\/\/\S+$/))),
  body: Schema.NullOr(Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(POST_BODY_MAX))),
});
export type NewPost = typeof NewPost.Type;

export const NewComment = Schema.Struct({
  body: Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(COMMENT_MAX)),
  /** The comment being replied to; null for a top-level comment. */
  parentId: Schema.NullOr(Schema.UUID),
});
export type NewComment = typeof NewComment.Type;

export const PostSort = Schema.Literal("top", "new");
export type PostSort = typeof PostSort.Type;

export const PostPage = Schema.Struct({ posts: Schema.Array(Post), hasMore: Schema.Boolean });
export type PostPage = typeof PostPage.Type;

export const VoteResult = Schema.Struct({ score: Schema.Number, voted: Schema.Boolean });
export type VoteResult = typeof VoteResult.Type;

// ---------------------------------------------------------------------------
// Authentication: an OpenAuth access token, sent as a bearer token.

export class CurrentUser extends Context.Tag("CurrentUser")<CurrentUser, User>() {}

export class Authentication extends HttpApiMiddleware.Tag<Authentication>()("Authentication", {
  failure: HttpApiError.Unauthorized,
  provides: CurrentUser,
  security: { bearer: HttpApiSecurity.bearer },
}) {}

/** Who is asking, on endpoints anyone may call: None when signed out or the token is bad. */
export class Viewer extends Context.Tag("Viewer")<Viewer, Option.Option<User>>() {}

export class OptionalAuthentication extends HttpApiMiddleware.Tag<OptionalAuthentication>()("OptionalAuthentication", {
  provides: Viewer,
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
  .add(
    HttpApiEndpoint.patch("update", "/me")
      .setPayload(ProfileUpdate)
      .addSuccess(User)
      // The profile theme must be one the member could wear.
      .addError(HttpApiError.Forbidden),
  )
  .add(
    HttpApiEndpoint.put("wear", "/me/theme")
      .setPayload(Schema.Struct({ themeId: Schema.String }))
      .addSuccess(User)
      .addError(HttpApiError.Forbidden),
  )
  .add(HttpApiEndpoint.get("themes", "/me/themes").addSuccess(Schema.Array(Theme)))
  // The image file itself is the request body; the API checks, resizes and stores it.
  .add(
    HttpApiEndpoint.put("uploadImage", "/me/images/:kind")
      .setPath(Schema.Struct({ kind: ImageKind }))
      .setPayload(HttpApiSchema.Uint8Array())
      .addSuccess(User)
      .addError(ImageRejected),
  )
  .add(HttpApiEndpoint.del("removeImage", "/me/images/:kind").setPath(Schema.Struct({ kind: ImageKind })).addSuccess(User))
  .middleware(Authentication) {}

export class ThemesApi extends HttpApiGroup.make("themes")
  .add(HttpApiEndpoint.get("community", "/themes").addSuccess(Schema.Array(Theme)))
  .add(HttpApiEndpoint.get("get", "/themes/:id").setPath(ThemeId).addSuccess(Theme).addError(HttpApiError.NotFound))
  .add(HttpApiEndpoint.post("create", "/themes").setPayload(NewTheme).addSuccess(Theme).middleware(Authentication))
  .add(HttpApiEndpoint.del("delete", "/themes/:id").setPath(ThemeId).addError(HttpApiError.NotFound).middleware(Authentication)) {}

const PostId = Schema.Struct({ id: Schema.UUID });

export class PostsApi extends HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("list", "/posts")
      .setUrlParams(
        Schema.Struct({
          sort: Schema.optional(PostSort),
          page: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 100))),
        }),
      )
      .addSuccess(PostPage)
      .middleware(OptionalAuthentication),
  )
  .add(
    HttpApiEndpoint.get("get", "/posts/:id")
      .setPath(PostId)
      .addSuccess(Schema.Struct({ post: Post, comments: Schema.Array(Comment) }))
      .addError(HttpApiError.NotFound)
      .middleware(OptionalAuthentication),
  )
  .add(HttpApiEndpoint.post("create", "/posts").setPayload(NewPost).addSuccess(Post).middleware(Authentication))
  .add(HttpApiEndpoint.del("delete", "/posts/:id").setPath(PostId).addError(HttpApiError.NotFound).middleware(Authentication))
  // Voting on your own post is refused: it already carries your vote.
  .add(
    HttpApiEndpoint.put("upvote", "/posts/:id/vote")
      .setPath(PostId)
      .addSuccess(VoteResult)
      .addError(HttpApiError.NotFound)
      .addError(HttpApiError.Forbidden)
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.del("unvote", "/posts/:id/vote")
      .setPath(PostId)
      .addSuccess(VoteResult)
      .addError(HttpApiError.NotFound)
      .addError(HttpApiError.Forbidden)
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.post("comment", "/posts/:id/comments")
      .setPath(PostId)
      .setPayload(NewComment)
      .addSuccess(Comment)
      .addError(HttpApiError.NotFound)
      .middleware(Authentication),
  ) {}

export class SessionApi extends HttpApiGroup.make("session")
  // Signing out: the refresh token itself is the credential, so no bearer token is needed.
  .add(HttpApiEndpoint.post("revoke", "/session/revoke").setPayload(Schema.Struct({ refreshToken: Schema.String }))) {}

export class Api extends HttpApi.make("waifu-devs").add(UsersApi).add(MeApi).add(ThemesApi).add(PostsApi).add(SessionApi) {}
