import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import type { User } from "@waifu-devs/domain/api";
import { UserAvatar } from "./Avatar";
import { InlineMarkdown } from "./Markdown";
import { Tilt } from "./motion";

export function MemberCard({ user }: { user: User }) {
  return (
    <Tilt className="rounded-xl">
      <Card className="gap-0 py-0">
        <Link to="/u/$username" params={{ username: user.username }} className="group flex items-center gap-3 p-3">
          <span className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
            <UserAvatar src={user.avatarUrl} name={user.username} size={44} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold">{user.displayName ?? user.username}</p>
            <p className="truncate text-xs text-muted-foreground">
              u/{user.username}
              {user.favoriteWaifu ? (
                <>
                  {" · ♡ "}
                  {/* The card is already a link. */}
                  <InlineMarkdown links={false}>{user.favoriteWaifu}</InlineMarkdown>
                </>
              ) : null}
            </p>
          </div>
        </Link>
      </Card>
    </Tilt>
  );
}
