import Link from "next/link";
import type { User } from "@/lib/db";
import { Avatar } from "./Avatar";

export function MemberCard({ user }: { user: User }) {
  return (
    <Link
      href={`/u/${user.username}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:-translate-y-0.5 hover:border-accent"
    >
      <Avatar src={user.avatar_url} name={user.username} size={44} />
      <div className="min-w-0">
        <p className="truncate font-bold">{user.display_name ?? user.username}</p>
        <p className="truncate text-xs text-muted">
          @{user.username}
          {user.favorite_waifu ? ` · ♡ ${user.favorite_waifu}` : ""}
        </p>
      </div>
    </Link>
  );
}
