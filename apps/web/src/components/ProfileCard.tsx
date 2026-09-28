import type { User } from "@waifu-devs/domain/api";
import { linkLabel } from "@waifu-devs/domain/profile";
import { Globe, Link2, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { UserAvatar } from "@/components/Avatar";
import { InlineMarkdown } from "@/components/Markdown";
import { ProfileBanner } from "@/components/ProfileBanner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export type ProfileView = Pick<
  User,
  | "username"
  | "displayName"
  | "avatarUrl"
  | "pronouns"
  | "location"
  | "status"
  | "favoriteWaifu"
  | "website"
  | "skills"
  | "links"
  | "banner"
  | "bannerUrl"
  | "createdAt"
>;

const pill = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:text-primary [&>svg]:size-3.5";

/**
 * The top of a profile page: banner, avatar, name and the bits a member chose
 * to show. It takes its colors from whatever theme surrounds it, so the
 * settings preview renders it exactly as visitors will see it.
 */
export function ProfileCard({ profile, actions, nameAs: Name = "h1" }: { profile: ProfileView; actions?: ReactNode; nameAs?: "h1" | "p" }) {
  const joined = new Date(profile.createdAt).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  const links = [
    ...(profile.website ? [{ href: profile.website, icon: <Globe /> }] : []),
    ...profile.links.map((href) => ({ href, icon: <Link2 /> })),
  ];

  return (
    <Card className="relative isolate gap-0 overflow-hidden py-0">
      <ProfileBanner banner={profile.banner} image={profile.bannerUrl} className="h-32 sm:h-40" />
      <div className="flex flex-col gap-4 px-6 pb-6">
        <div className="-mt-12 flex items-end justify-between gap-4 sm:-mt-14">
          <span className="rounded-full bg-card p-1 shadow-lg">
            <span className="avatar-ring wiggle-hover block rounded-full p-1">
              <UserAvatar src={profile.avatarUrl} name={profile.username} size={104} />
            </span>
          </span>
          {actions}
        </div>

        <div className="flex flex-col gap-1">
          <Name className="break-words text-3xl font-extrabold">{profile.displayName ?? profile.username}</Name>
          <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
            <a href={`https://github.com/${profile.username}`} className="hover:text-primary">
              u/{profile.username}
            </a>
            {profile.pronouns ? <span>· {profile.pronouns}</span> : null}
            {profile.location ? (
              <span className="inline-flex items-center gap-1">
                · <MapPin className="size-3.5" /> {profile.location}
              </span>
            ) : null}
            <span>· joined {joined}</span>
          </p>
        </div>

        {profile.status ? (
          <p className="inline-flex w-fit max-w-full items-center gap-2.5 rounded-full border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">
            <span className="status-dot shrink-0" />
            <InlineMarkdown className="min-w-0 break-words">{profile.status}</InlineMarkdown>
          </p>
        ) : null}

        {profile.favoriteWaifu || profile.skills.length ? (
          <div className="flex flex-wrap gap-2">
            {profile.favoriteWaifu ? (
              <Badge data-burst className="cursor-pointer px-3 py-1 text-sm transition-transform hover:scale-105">
                <span className="heartbeat">♡</span> <InlineMarkdown>{profile.favoriteWaifu}</InlineMarkdown>
              </Badge>
            ) : null}
            {profile.skills.map((skill) => (
              <Badge key={skill} variant="secondary" className="px-3 py-1 text-sm transition-transform duration-200 hover:-translate-y-0.5 hover:rotate-[-2deg]">
                {skill}
              </Badge>
            ))}
          </div>
        ) : null}

        {links.length ? (
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <a key={link.href} href={link.href} rel="nofollow noopener noreferrer" target="_blank" className={pill}>
                {link.icon}
                <span className="max-w-56 truncate">{linkLabel(link.href)}</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
