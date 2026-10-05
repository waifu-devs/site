import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { CommentComposer, CommentThread } from "@/components/news/Comments";
import { Markdown } from "@/components/Markdown";
import { commentTree } from "@/components/news/format";
import { PostRow } from "@/components/news/PostRow";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { useViewer } from "@/lib/viewer";
import { deletePost, getPost } from "@/server/news";

export const Route = createFileRoute("/news/$postId")({
  loader: ({ params }) => getPost({ data: params.postId }),
  head: ({ loaderData, matches }) => {
    const t = headT(matches);
    return { meta: [title(loaderData ? t("news.titlePost", { title: loaderData.post.title }) : t("common.notFound.pageTitle"))] };
  },
  component: PostPage,
});

/** Deleting takes two presses: the first asks if you're sure. */
function DeletePost({ postId }: { postId: string }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  return (
    <AnimatePresence mode="wait" initial={false}>
      {confirming ? (
        <motion.div key="confirm" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}>
          <ActionForm action={deletePost} className="flex items-center gap-2">
            <input type="hidden" name="post_id" value={postId} />
            <span className="text-sm font-bold text-muted-foreground">{t("news.post.deleteConfirm")}</span>
            <Button type="submit" size="sm" variant="destructive" className="btn rounded-full font-bold">
              {t("news.post.deleteForGood")}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => setConfirming(false)}>
              {t("news.post.keep")}
            </Button>
          </ActionForm>
        </motion.div>
      ) : (
        <motion.div key="ask" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
          <Button type="button" size="sm" variant="ghost" className="group rounded-full text-muted-foreground hover:text-destructive" onClick={() => setConfirming(true)}>
            <Trash2 className="transition-transform group-hover:-rotate-12" /> {t("news.post.delete")}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PostPage() {
  const { post, comments } = Route.useLoaderData();
  const { user } = useViewer();
  const { t } = useI18n();
  const tree = useMemo(() => commentTree(comments), [comments]);
  const mine = user !== null && user.username.toLowerCase() === post.author.username.toLowerCase();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <Link to="/news" className="rise group inline-flex w-fit items-center gap-1 text-sm font-bold text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" /> {t("news.post.back")}
      </Link>

      <Card className="rise relative isolate gap-4 overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="blob -right-16 -top-20 -z-10 h-56 w-56" />
        <PostRow post={post} viewerUsername={user?.username ?? null} large />
        {post.body ? (
          <Markdown className="leading-relaxed sm:pl-16">{post.body}</Markdown>
        ) : null}
        {mine ? (
          <div className="flex justify-end">
            <DeletePost postId={post.id} />
          </div>
        ) : null}
      </Card>

      <section className="stagger flex flex-col gap-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {comments.length === 0 ? t("news.post.commentsHeading") : t("news.post.commentCount", { count: comments.length })}
        </h2>
        {user ? (
          <CommentComposer postId={post.id} />
        ) : (
          <Card data-sparkle-zone className="flex-row items-center justify-between gap-4 px-5 py-4">
            <p className="text-muted-foreground">{t("news.post.signInPrompt")}</p>
            <Button asChild size="sm" className="btn rounded-full font-bold">
              <Link to="/login" search={{ next: `/news/${post.id}` }}>
                {t("common.nav.signIn")}
              </Link>
            </Button>
          </Card>
        )}
        {tree.length ? (
          <CommentThread nodes={tree} postId={post.id} postAuthor={post.author.username} signedIn={user !== null} />
        ) : (
          <p className="py-6 text-center text-muted-foreground">
            <span className="float inline-block text-2xl">(っ˘ω˘ς )</span>
            <br />
            {t("news.post.noComments")}
          </p>
        )}
      </section>
    </main>
  );
}
