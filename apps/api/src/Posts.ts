import { SqlClient } from "@effect/sql";
import type { Comment, NewComment, NewPost, Post, PostSort, User } from "@waifu-devs/domain/api";
import { and, asc, count, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { Effect, Option } from "effect";
import { Db } from "./Db.ts";
import { avatarColumn } from "./Media.ts";
import { comments, postVotes, posts, users } from "./schema.ts";

export const PAGE_SIZE = 30;

/**
 * Hacker News' ranking: points decay with age as (hours + 2)^1.8. HN leaves out the
 * submitter's own vote; in a small community that would put any upvoted post, however
 * old, above every new one, so here it counts.
 */
const rank = sql`${posts.score} / power(extract(epoch from now() - ${posts.createdAt}) / 3600 + 2, 1.8)`;

type Byline = { authorUsername: string; authorAvatarUrl: string | null };
type PostRow = typeof posts.$inferSelect & Byline & { voted: boolean };
type CommentRow = typeof comments.$inferSelect & Byline;

const toPost = (row: PostRow): Post => ({
  id: row.id,
  title: row.title,
  url: row.url,
  body: row.body,
  author: { username: row.authorUsername, avatarUrl: row.authorAvatarUrl },
  score: row.score,
  commentCount: row.commentCount,
  createdAt: row.createdAt,
  voted: row.voted,
});

const toComment = (row: CommentRow): Comment => ({
  id: row.id,
  parentId: row.parentId,
  body: row.body,
  author: { username: row.authorUsername, avatarUrl: row.authorAvatarUrl },
  createdAt: row.createdAt,
});

export class Posts extends Effect.Service<Posts>()("Posts", {
  effect: Effect.gen(function* () {
    const db = yield* Db;
    const client = yield* SqlClient.SqlClient;
    // Uploaded profile pictures win over GitHub avatars here too.
    const authorAvatarUrl = yield* avatarColumn;

    /** Posts with their author, and whether `viewerId` (if anyone) has upvoted each. */
    const select = (viewerId: string | null) =>
      db
        .select({
          ...getTableColumns(posts),
          authorUsername: users.username,
          authorAvatarUrl,
          voted: viewerId
            ? sql<boolean>`exists (select 1 from ${postVotes} where ${postVotes.postId} = ${posts.id} and ${postVotes.userId} = ${viewerId})`
            : sql<boolean>`false`,
        })
        .from(posts)
        .innerJoin(users, eq(users.id, posts.authorId));

    /** One page of the front page ("top", ranked) or of everything, newest first ("new"). */
    const list = (options: { sort: PostSort; page: number; viewerId: string | null }) =>
      select(options.viewerId)
        .orderBy(...(options.sort === "new" ? [desc(posts.createdAt)] : [desc(rank), desc(posts.createdAt)]))
        .limit(PAGE_SIZE + 1)
        .offset((options.page - 1) * PAGE_SIZE)
        .pipe(Effect.map((rows) => ({ posts: rows.slice(0, PAGE_SIZE).map(toPost), hasMore: rows.length > PAGE_SIZE })));

    /** A post and all its comments, oldest first (the web app nests them). */
    const get = (id: string, viewerId: string | null) =>
      Effect.all(
        [
          select(viewerId).where(eq(posts.id, id)),
          db
            .select({ ...getTableColumns(comments), authorUsername: users.username, authorAvatarUrl })
            .from(comments)
            .innerJoin(users, eq(users.id, comments.authorId))
            .where(eq(comments.postId, id))
            .orderBy(asc(comments.createdAt)),
        ],
        { concurrency: 2 },
      ).pipe(
        Effect.map(([postRows, commentRows]) =>
          Option.fromNullable(postRows[0]).pipe(Option.map((row) => ({ post: toPost(row), comments: commentRows.map(toComment) }))),
        ),
      );

    const authorOf = (id: string) =>
      db
        .select({ authorId: posts.authorId })
        .from(posts)
        .where(eq(posts.id, id))
        .pipe(Effect.map((rows) => Option.fromNullable(rows[0]?.authorId)));

    /** Saves a new post, upvoted by its author. */
    const create = (author: User, input: NewPost) =>
      client.withTransaction(
        Effect.gen(function* () {
          const [row] = yield* db.insert(posts).values({ authorId: author.id, title: input.title, url: input.url, body: input.body }).returning();
          yield* db.insert(postVotes).values({ postId: row.id, userId: author.id });
          return toPost({ ...row, authorUsername: author.username, authorAvatarUrl: author.avatarUrl, voted: true });
        }),
      );

    /** Deletes a member's own post, with its votes and comments. */
    const remove = (authorId: string, id: string) =>
      db
        .delete(posts)
        .where(and(eq(posts.id, id), eq(posts.authorId, authorId)))
        .returning({ id: posts.id })
        .pipe(Effect.map((rows) => rows.length > 0));

    /** Adds (`up`) or takes back a member's upvote. Voting twice, or unvoting twice, changes nothing. */
    const vote = (userId: string, postId: string, up: boolean) =>
      client.withTransaction(
        Effect.gen(function* () {
          const changed = up
            ? yield* db.insert(postVotes).values({ postId, userId }).onConflictDoNothing().returning({ postId: postVotes.postId })
            : yield* db
                .delete(postVotes)
                .where(and(eq(postVotes.postId, postId), eq(postVotes.userId, userId)))
                .returning({ postId: postVotes.postId });
          const [post] = changed.length
            ? yield* db
                .update(posts)
                .set({ score: sql`${posts.score} + ${up ? 1 : -1}` })
                .where(eq(posts.id, postId))
                .returning({ score: posts.score })
            : yield* db.select({ score: posts.score }).from(posts).where(eq(posts.id, postId));
          return { score: post?.score ?? 0, voted: up };
        }),
      );

    /** Adds a comment (a reply when `parentId` is set). None if the post, or the parent in it, is gone. */
    const comment = (author: User, postId: string, input: NewComment) =>
      client.withTransaction(
        Effect.gen(function* () {
          if (input.parentId) {
            const [parent] = yield* db
              .select({ n: count() })
              .from(comments)
              .where(and(eq(comments.id, input.parentId), eq(comments.postId, postId)));
            if (!parent?.n) return Option.none<Comment>();
          }
          const counted = yield* db
            .update(posts)
            .set({ commentCount: sql`${posts.commentCount} + 1` })
            .where(eq(posts.id, postId))
            .returning({ id: posts.id });
          if (!counted.length) return Option.none<Comment>();
          const [row] = yield* db
            .insert(comments)
            .values({ postId, parentId: input.parentId, authorId: author.id, body: input.body })
            .returning();
          return Option.some(toComment({ ...row, authorUsername: author.username, authorAvatarUrl: author.avatarUrl }));
        }),
      );

    return { list, get, authorOf, create, remove, vote, comment } as const;
  }),
}) {}
