import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { COMMENT_MAX } from "@waifu-devs/domain/api";
import { Loader2, MessageCircleReply, Minus, Plus, Send } from "lucide-react";
import { AnimatePresence, m as motion } from "motion/react";
import { useState } from "react";
import { UserAvatar } from "@/components/Avatar";
import { Markdown } from "@/components/Markdown";
import { MarkdownField } from "@/components/MarkdownField";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { addComment } from "@/server/news";
import type { CommentNode } from "./format";
import { TimeAgo } from "./TimeAgo";

/** Past this depth replies stop stepping right, so deep threads stay readable on a phone. */
const MAX_INDENT = 5;

const open = { height: "auto", opacity: 1 };
const shut = { height: 0, opacity: 0 };
const spring = { type: "spring", stiffness: 380, damping: 34 } as const;

/** A comment box: top-level on the post, or a reply under a comment. Markdown works. */
export function CommentComposer({
  postId,
  parentId = null,
  onDone,
  autoFocus = false,
}: {
  postId: string;
  parentId?: string | null;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const send = useServerFn(addComment);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(true);
  // Bumped after sending, so the field starts over empty and back on Write.
  const [round, setRound] = useState(0);

  return (
    <form
      action={addComment.url}
      method="post"
      aria-busy={pending || undefined}
      className="flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (empty) return;
        setPending(true);
        setError(null);
        try {
          await send({ data: new FormData(event.currentTarget) });
          setRound((r) => r + 1);
          setEmpty(true);
          await router.invalidate();
          onDone?.();
        } catch {
          setError(t("news.comment.failed"));
        } finally {
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="post_id" value={postId} />
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}
      <MarkdownField
        key={round}
        name="body"
        required
        maxLength={COMMENT_MAX}
        autoFocus={autoFocus}
        rows={parentId ? 2 : 3}
        placeholder={parentId ? t("news.comment.replyPlaceholder") : t("news.comment.placeholder")}
        onValueChange={(value) => setEmpty(value.trim().length === 0)}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || empty} className="btn rounded-full font-bold">
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          {parentId ? t("news.comment.reply") : t("news.comment.submit")}
        </Button>
        {onDone ? (
          <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onDone}>
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
      <AnimatePresence>
        {error ? (
          <motion.p initial={shut} animate={open} exit={shut} className="overflow-hidden text-sm font-bold text-destructive">
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </form>
  );
}

type ThreadProps = { postId: string; postAuthor: string; signedIn: boolean };

/** A list of comments and, nested under each, its replies. */
export function CommentThread({ nodes, depth = 0, ...props }: ThreadProps & { nodes: CommentNode[]; depth?: number }) {
  return (
    <ul className={cn("flex flex-col", depth ? "mt-4 gap-4" : "gap-6")}>
      {nodes.map((node) => (
        <CommentItem key={node.id} node={node} depth={depth} {...props} />
      ))}
    </ul>
  );
}

function CommentItem({ node, depth, postId, postAuthor, signedIn }: ThreadProps & { node: CommentNode; depth: number }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const isOp = node.author.username.toLowerCase() === postAuthor.toLowerCase();
  const indent = depth < MAX_INDENT;
  const replies = node.replies.length ? <CommentThread nodes={node.replies} depth={depth + 1} postId={postId} postAuthor={postAuthor} signedIn={signedIn} /> : null;

  return (
    <motion.li id={`c-${node.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="scroll-mt-24">
      <div className="flex gap-2.5">
        <div className="flex shrink-0 flex-col items-center">
          <Link to="/u/$username" params={{ username: node.author.username }} className="wiggle-hover rounded-full">
            <UserAvatar src={node.author.avatarUrl} name={node.author.username} size={depth ? 24 : 30} />
          </Link>
          {/* The thread line: hover lights it up, clicking folds the thread away. */}
          {!collapsed ? (
            <button
              type="button"
              aria-label={t("news.comment.collapse")}
              onClick={() => setCollapsed(true)}
              className="group/line mt-1.5 flex w-5 flex-1 cursor-pointer justify-center"
            >
              <span className="w-0.5 rounded-full bg-border transition-[background-color,width] duration-200 group-hover/line:w-1 group-hover/line:bg-primary" />
            </button>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            <Link to="/u/$username" params={{ username: node.author.username }} className="font-bold text-foreground hover:text-primary">
              u/{node.author.username}
            </Link>
            {isOp ? (
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-extrabold uppercase leading-4 text-primary-foreground">{t("news.comment.op")}</span>
            ) : null}
            <span aria-hidden>·</span>
            <a href={`#c-${node.id}`} className="hover:text-primary">
              <TimeAgo date={node.createdAt} />
            </a>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              className="inline-flex cursor-pointer items-center gap-0.5 rounded-full border px-1.5 text-xs font-bold transition-colors hover:border-primary hover:text-primary"
            >
              {collapsed ? <Plus className="size-3" /> : <Minus className="size-3" />}
              {collapsed ? t("news.comment.hidden", { count: node.descendants + 1 }) : null}
            </button>
          </div>
          <AnimatePresence initial={false}>
            {!collapsed ? (
              <motion.div key="body" initial={shut} animate={open} exit={shut} transition={spring} className="overflow-hidden">
                <Markdown className="mt-1 leading-relaxed">{node.body}</Markdown>
                {signedIn ? (
                  <button
                    type="button"
                    onClick={() => setReplying((r) => !r)}
                    aria-expanded={replying}
                    className={cn(
                      "group/reply mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs font-bold hover:text-primary",
                      replying ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <MessageCircleReply className="size-3.5 transition-transform duration-300 group-hover/reply:-rotate-12 group-hover/reply:scale-125" />
                    {t("news.comment.reply")}
                  </button>
                ) : null}
                <AnimatePresence initial={false}>
                  {replying ? (
                    <motion.div key="reply" initial={shut} animate={open} exit={shut} transition={spring} className="overflow-hidden">
                      <div className="pt-2">
                        <CommentComposer postId={postId} parentId={node.id} autoFocus onDone={() => setReplying(false)} />
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {indent ? replies : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      {!indent && !collapsed ? replies : null}
    </motion.li>
  );
}
