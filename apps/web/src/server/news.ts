/**
 * Server functions for News: the front page, a post with its comments, and the
 * writes (submitting, voting, commenting, deleting).
 */
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { COMMENT_MAX, type NewPost, POST_BODY_MAX, POST_TITLE_MAX, POST_URL_MAX, type PostSort } from "@waifu-devs/domain/api";
import { Effect, Option } from "effect";
import { ApiClient } from "./Api.ts";
import { asUser, formData, orNotFound, text, url } from "./helpers.ts";
import { run } from "./runtime.ts";
import { Session } from "./Session.ts";

/** Calls the API as the viewer when signed in (so their votes show), anonymously otherwise. */
const asViewer = Effect.gen(function* () {
  const api = yield* ApiClient;
  const token = yield* (yield* Session).accessToken;
  return Option.isSome(token) ? yield* api.as(token.value) : api.anonymous;
});

export type NewsSearch = { sort: PostSort; page: number };

export const getNews = createServerFn({ method: "GET" })
  .validator((search: NewsSearch) => search)
  .handler(({ data }) => run(asViewer.pipe(Effect.flatMap((api) => api.posts.list({ urlParams: data })))));

export const getPost = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(({ data: id }) => run(asViewer.pipe(Effect.flatMap((api) => orNotFound(api.posts.get({ path: { id } }))))));

export const submitPost = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(
      Effect.gen(function* () {
        const payload: NewPost = {
          title: text(form, "title", POST_TITLE_MAX) ?? "",
          url: url(form, "url", POST_URL_MAX),
          body: text(form, "body", POST_BODY_MAX),
        };
        const post = yield* (yield* asUser).posts.create({ payload });
        return yield* Effect.die(redirect({ to: "/news/$postId", params: { postId: post.id } }));
      }),
    ),
  );

export const votePost = createServerFn({ method: "POST" })
  .validator((data: { postId: string; up: boolean }) => ({ postId: String(data.postId), up: data.up === true }))
  .handler(({ data }) =>
    run(
      asUser.pipe(
        Effect.flatMap((api) => (data.up ? api.posts.upvote({ path: { id: data.postId } }) : api.posts.unvote({ path: { id: data.postId } }))),
      ),
    ),
  );

export const addComment = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(
      asUser.pipe(
        Effect.flatMap((api) =>
          api.posts.comment({
            path: { id: text(form, "post_id", 64) ?? "" },
            payload: { body: text(form, "body", COMMENT_MAX) ?? "", parentId: text(form, "parent_id", 64) },
          }),
        ),
        Effect.asVoid,
      ),
    ),
  );

export const deletePost = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data: form }) =>
    run(
      Effect.gen(function* () {
        yield* (yield* asUser).posts.delete({ path: { id: text(form, "post_id", 64) ?? "" } });
        return yield* Effect.die(redirect({ to: "/news" }));
      }),
    ),
  );
