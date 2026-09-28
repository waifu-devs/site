import type { Comment } from "@waifu-devs/domain/api";

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 hours ago", "yesterday", "just now". */
export function timeAgo(date: Date | string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(date).getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}

/** A relative time that shows the exact one on hover. Server and browser clocks differ, hence the warning opt-out. */
export function TimeAgo({ date, className }: { date: Date | string; className?: string }) {
  const d = new Date(date);
  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })} className={className} suppressHydrationWarning>
      {timeAgo(d)}
    </time>
  );
}

/** The site a link points to, without the "www.". */
export function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type CommentNode = Comment & { replies: CommentNode[]; descendants: number };

/** Nests a post's comments (oldest first) under their parents. */
export function commentTree(comments: ReadonlyArray<Comment>): CommentNode[] {
  const nodes = new Map<string, CommentNode>(comments.map((c) => [c.id, { ...c, replies: [], descendants: 0 }]));
  const roots: CommentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    (parent ? parent.replies : roots).push(node);
  }
  const count = (node: CommentNode): number => (node.descendants = node.replies.reduce((n, r) => n + 1 + count(r), 0));
  roots.forEach(count);
  return roots;
}
