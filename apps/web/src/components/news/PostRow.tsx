import { Link } from "@tanstack/react-router";
import type { Post } from "@waifu-devs/domain/api";
import { ArrowUpRight, Clock, MessageCircle } from "lucide-react";
import { UserAvatar } from "@/components/Avatar";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { hostname } from "./format";
import { TimeAgo } from "./TimeAgo";
import { VoteButton } from "./VoteButton";

const HOUR = 60 * 60 * 1000;

/** Underline that sweeps in under every line of a (possibly wrapping) title. */
const sweep =
  "bg-gradient-to-r from-primary to-primary bg-[length:0%_2px] bg-left-bottom bg-no-repeat transition-[background-size] duration-300 ease-out hover:bg-[length:100%_2px] [box-decoration-break:clone]";

/**
 * One post: heart button, title (out to the link, or in to the discussion), site,
 * and who posted it when. `rank` shows its place on the front page.
 */
export function PostRow({
  post,
  rank,
  viewerUsername,
  large = false,
  preview = false,
}: {
  post: Post;
  rank?: number;
  viewerUsername: string | null;
  /** The heading on a post's own page. */
  large?: boolean;
  /** A stand-in on the submit page: nothing is clickable. */
  preview?: boolean;
}) {
  const { t } = useI18n();
  const host = post.url ? hostname(post.url) : null;
  const mine = viewerUsername !== null && viewerUsername.toLowerCase() === post.author.username.toLowerCase();
  const fresh = Date.now() - new Date(post.createdAt).getTime() < HOUR;
  const Title = large ? "h1" : "h2";
  const titleClass = cn("font-extrabold leading-snug text-foreground", large ? "text-2xl sm:text-3xl" : "text-base sm:text-lg");

  return (
    <div inert={preview || undefined} className="flex items-start gap-3 sm:gap-4">
      {rank !== undefined ? (
        <span
          aria-hidden
          className="hidden w-9 shrink-0 pt-1.5 text-right text-2xl font-extrabold tabular-nums text-muted-foreground/35 transition-colors duration-300 group-hover:text-primary sm:block"
        >
          {String(rank).padStart(2, "0")}
        </span>
      ) : null}
      <VoteButton postId={post.id} score={post.score} voted={post.voted} mine={mine} signedIn={viewerUsername !== null} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <Title className={titleClass}>
          {post.url ? (
            <a href={post.url} target="_blank" rel="nofollow noopener noreferrer" className={cn("group/title", sweep)}>
              {post.title}
              <ArrowUpRight className="ml-0.5 inline size-4 align-baseline text-muted-foreground transition-transform duration-300 group-hover/title:-translate-y-0.5 group-hover/title:translate-x-0.5 group-hover/title:text-primary" />
            </a>
          ) : large ? (
            post.title
          ) : (
            <Link to="/news/$postId" params={{ postId: post.id }} className={sweep}>
              {post.title}
            </Link>
          )}
        </Title>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
          {host ? (
            <span className="rounded-full border bg-background/60 px-2 py-0.5 font-bold text-foreground/70">{host}</span>
          ) : null}
          {fresh ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              {t("news.row.new")}
            </span>
          ) : null}
          <Link
            to="/u/$username"
            params={{ username: post.author.username }}
            className="group/author inline-flex items-center gap-1.5 font-bold hover:text-primary"
          >
            <UserAvatar src={post.author.avatarUrl} name={post.author.username} size={18} className="border transition-transform duration-300 group-hover/author:scale-125 group-hover/author:-rotate-6" />
            u/{post.author.username}
          </Link>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" />
            <TimeAgo date={post.createdAt} />
          </span>
          <Link
            to="/news/$postId"
            params={{ postId: post.id }}
            className="group/comments inline-flex items-center gap-1 font-bold hover:text-primary"
          >
            <MessageCircle className="size-3.5 transition-transform duration-300 group-hover/comments:-rotate-12 group-hover/comments:scale-125" />
            {post.commentCount === 0 ? t("news.row.discuss") : t("news.post.commentCount", { count: post.commentCount })}
          </Link>
        </div>
      </div>
    </div>
  );
}
