import Link from "next/link";
import type { User } from "@/lib/db";
import { Avatar } from "./Avatar";
import { Tilt } from "./motion";

export function MemberCard({ user }: { user: User }) {
  return (
    <Tilt className="rounded-2xl border border-line bg-surface">
      <Link href={`/u/${user.username}`} className="group flex items-center gap-3 p-3">
        <span className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
          <Avatar src={user.avatar_url} name={user.username} size={44} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold">{user.display_name ?? user.username}</p>
          <p className="truncate text-xs text-muted">
            @{user.username}
            {user.favorite_waifu ? ` · ♡ ${user.favorite_waifu}` : ""}
          </p>
        </div>
      </Link>
    </Tilt>
  );
}
