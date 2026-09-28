import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserAvatar } from "@/components/Avatar";
import { Tilt } from "@/components/motion";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTheme, getUserByUsername, listThemesByOwner } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { themeStyle } from "@/lib/themes";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const user = await getUserByUsername(username);
  return { title: user ? `${user.display_name ?? user.username} (u/${user.username})` : "Not found" };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const user = await getUserByUsername(username);
  if (!user) notFound();

  const [viewer, theme, themes] = await Promise.all([currentUser(), getTheme(user.theme_id), listThemesByOwner(user.id)]);
  const isMe = viewer?.id === user.id;
  const visibleThemes = isMe ? themes : themes.filter((t) => t.isPublic);
  const joined = new Date(user.created_at).toLocaleDateString("en", { month: "long", year: "numeric" });

  // The profile is always shown in its owner's theme variant, whatever the visitor is wearing.
  return (
    <main className="themed min-h-full" style={themeStyle(theme.variant)}>
      <div className="stagger mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
        <Card className="relative isolate overflow-hidden p-6">
          <div aria-hidden className="blob -right-10 -top-16 -z-10 h-48 w-48" />
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="avatar-ring wiggle-hover relative shrink-0 rounded-full p-1">
              <UserAvatar src={user.avatar_url} name={user.username} size={112} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h1 className="text-3xl font-extrabold">{user.display_name ?? user.username}</h1>
              <p className="text-muted-foreground">
                <a href={`https://github.com/${user.username}`} className="hover:text-primary">u/{user.username}</a>
                {user.pronouns ? ` · ${user.pronouns}` : ""} · joined {joined}
              </p>
              {user.favorite_waifu ? (
                <Badge data-burst className="mt-2 cursor-pointer px-3 py-1 text-sm transition-transform hover:scale-105">
                  <span className="heartbeat">♡</span> {user.favorite_waifu}
                </Badge>
              ) : null}
            </div>
            {isMe ? (
              <Button asChild variant="outline" className="btn self-start rounded-full font-bold">
                <Link href="/settings">Edit profile</Link>
              </Button>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line">{user.bio ?? "This dev hasn't written a bio yet. (´・ω・`)"}</p>
            {user.website ? (
              <a href={user.website} rel="nofollow noopener noreferrer" target="_blank" className="nav-link mt-4 inline-block font-bold text-primary">
                {user.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
              </a>
            ) : null}
          </CardContent>
        </Card>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Wearing <span className="text-foreground">{theme.name}</span>
            {theme.ownerUsername && theme.ownerUsername !== user.username ? ` by u/${theme.ownerUsername}` : ""}
          </h2>
          {visibleThemes.length ? (
            <>
              <h2 className="mt-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">Themes by u/{user.username}</h2>
              <div className="stagger grid gap-4 sm:grid-cols-3">
                {visibleThemes.map((t) => (
                  <Tilt key={t.id} className="flex flex-col gap-2 rounded-lg">
                    <ThemeSwatch theme={t} />
                    <p className="text-sm font-bold">{t.name}</p>
                  </Tilt>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
