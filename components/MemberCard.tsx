import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { User } from "@/lib/db";
import { UserAvatar } from "./Avatar";
import { Tilt } from "./motion";

export function MemberCard({ user }: { user: User }) {
  return (
    <Tilt className="rounded-xl">
      <Card className="gap-0 py-0">
        <Link href={`/u/${user.username}`} className="group flex items-center gap-3 p-3">
          <span className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
            <UserAvatar src={user.avatar_url} name={user.username} size={44} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold">{user.display_name ?? user.username}</p>
            <p className="truncate text-xs text-muted-foreground">
              u/{user.username}
              {user.favorite_waifu ? ` · ♡ ${user.favorite_waifu}` : ""}
            </p>
          </div>
        </Link>
      </Card>
    </Tilt>
  );
}
