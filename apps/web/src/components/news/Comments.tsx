import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { COMMENT_MAX } from "@waifu-devs/domain/api";
import { Loader2, MessageCircleReply, Minus, Plus, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { UserAvatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addComment } from "@/server/news";
import { type CommentNode, Linkify, TimeAgo } from "./format";

/** Past this depth replies stop stepping right, so deep threads stay readable on a phone. */
const MAX_INDENT = 5;

const open = { height: "auto", opacity: 1 };
const shut = { height: 0, opacity: 0 };
const spring = { type: "spring", stiffness: 380, damping: 34 } as const;

/** A comment box: top-level on the post, or a reply under a comment. */
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
  const send = useServerFn(addComment);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [length, setLength] = useState(0);
  const ref = useRef<HTMLFormElement>(null);
  const near = length > COMMENT_MAX * 0.8;

  return (
    <form
      ref={ref}
      aria-busy={pending || undefined}
      className="flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setPending(true);
        setError(null);
        try {
          await send({ data: new FormData(form) });
          form.reset();
          setLength(0);
          await router.invalidate();
          onDone?.();
        } catch {
          setError("That didn't go through. Try again in a moment?");
        } finally {
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="post_id" value={postId} />
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}
      <Textarea
        name="body"
        required
        maxLength={COMMENT_MAX}
        autoFocus={autoFocus}
        rows={parentId ? 2 : 3}
        placeholder={parentId ? "Write a reply..." : "Say something nice (or at least interesting)..."}
        className="max-h-96 resize-none bg-card/80 text-base backdrop-blur transition-[box-shadow,border-color] focus-visible:shadow-[0_10px_30px_-18px_var(--primary)]"
        onChange={(e) => setLength(e.currentTarget.value.length)}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter sends.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ref.current?.requestSubmit();
        }}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || length === 0} className="btn rounded-full font-bold">
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          {parentId ? "Reply" : "Comment"}
        </Button>
        {onDone ? (
          <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
        <AnimatePresence>
          {near ? (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className={cn("ml-auto text-xs tabular-nums", length >= COMMENT_MAX ? "text-destructive" : "text-muted-foreground")}
            >
              {COMMENT_MAX - length} left
            </motion.span>
          ) : null}
        </AnimatePresence>
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
              aria-label="Collapse thread"
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
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-extrabold uppercase leading-4 text-primary-foreground">OP</span>
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
              {collapsed ? `${node.descendants + 1} hidden` : null}
            </button>
          </div>
          <AnimatePresence initial={false}>
            {!collapsed ? (
              <motion.div key="body" initial={shut} animate={open} exit={shut} transition={spring} className="overflow-hidden">
                <p className="mt-1 whitespace-pre-line break-words leading-relaxed">
                  <Linkify text={node.body} />
                </p>
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
                    Reply
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
