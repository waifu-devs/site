import { createFileRoute, Link } from "@tanstack/react-router";
import { themeStyle } from "@waifu-devs/domain/themes";
import { UserAvatar } from "@/components/Avatar";
import { Tilt } from "@/components/motion";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { title } from "@/lib/head";
import { getProfile } from "@/server/functions";

export const Route = createFileRoute("/u/$username")({
  loader: ({ params }) => getProfile({ data: params.username }),
  head: ({ loaderData }) => ({
    meta: [title(loaderData ? `${loaderData.user.displayName ?? loaderData.user.username} (u/${loaderData.user.username})` : "Not found")],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, theme, themes, isMe } = Route.useLoaderData();
  const joined = new Date(user.createdAt).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });

  // The profile is always shown in its owner's theme variant, whatever the visitor is wearing.
  return (
    <main className="themed min-h-full" style={themeStyle(theme.variant)}>
      <div className="stagger mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
        <Card className="relative isolate overflow-hidden p-6">
          <div aria-hidden className="blob -right-10 -top-16 -z-10 h-48 w-48" />
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="avatar-ring wiggle-hover relative shrink-0 rounded-full p-1">
              <UserAvatar src={user.avatarUrl} name={user.username} size={112} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h1 className="text-3xl font-extrabold">{user.displayName ?? user.username}</h1>
              <p className="text-muted-foreground">
                <a href={`https://github.com/${user.username}`} className="hover:text-primary">u/{user.username}</a>
                {user.pronouns ? ` · ${user.pronouns}` : ""} · joined {joined}
              </p>
              {user.favoriteWaifu ? (
                <Badge data-burst className="mt-2 cursor-pointer px-3 py-1 text-sm transition-transform hover:scale-105">
                  <span className="heartbeat">♡</span> {user.favoriteWaifu}
                </Badge>
              ) : null}
            </div>
            {isMe ? (
              <Button asChild variant="outline" className="btn self-start rounded-full font-bold">
                <Link to="/settings">Edit profile</Link>
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
          {themes.length ? (
            <>
              <h2 className="mt-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">Themes by u/{user.username}</h2>
              <div className="stagger grid gap-4 sm:grid-cols-3">
                {themes.map((t) => (
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
