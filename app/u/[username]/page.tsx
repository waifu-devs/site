import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Tilt } from "@/components/motion";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { getTheme, getUserByUsername, listThemesByOwner } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { themeStyle } from "@/lib/themes";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const user = await getUserByUsername(username);
  return { title: user ? (user.display_name ?? user.username) : "Not found" };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const user = await getUserByUsername(username);
  if (!user) notFound();

  const [viewer, theme, themes] = await Promise.all([currentUser(), getTheme(user.theme_id), listThemesByOwner(user.id)]);
  const isMe = viewer?.id === user.id;
  const visibleThemes = isMe ? themes : themes.filter((t) => t.isPublic);
  const joined = new Date(user.created_at).toLocaleDateString("en", { month: "long", year: "numeric" });

  // The profile is always shown in its owner's theme, whatever the visitor is wearing.
  return (
    <main className="themed min-h-full" style={themeStyle(theme.colors)}>
      <div className="stagger mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
        <section className="relative isolate flex flex-col gap-5 overflow-hidden rounded-3xl border border-line bg-surface p-6 sm:flex-row sm:items-center">
          <div aria-hidden className="blob -right-10 -top-16 -z-10 h-48 w-48" />
          <span className="avatar-ring wiggle-hover relative shrink-0 rounded-full p-1">
            <Avatar src={user.avatar_url} name={user.username} size={112} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="text-3xl font-extrabold">{user.display_name ?? user.username}</h1>
            <p className="text-muted">
              <a href={`https://github.com/${user.username}`} className="hover:text-accent">@{user.username}</a>
              {user.pronouns ? ` · ${user.pronouns}` : ""} · joined {joined}
            </p>
            {user.favorite_waifu ? (
              <p data-burst className="mt-2 inline-flex w-fit cursor-pointer rounded-full bg-accent px-3 py-1 text-sm font-bold text-on-accent transition-transform hover:scale-105">
                <span className="heartbeat mr-1">♡</span> {user.favorite_waifu}
              </p>
            ) : null}
          </div>
          {isMe ? (
            <Link href="/settings" className="btn relative self-start rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold hover:border-accent">
              Edit profile
            </Link>
          ) : null}
        </section>

        <section className="rounded-3xl border border-line bg-surface p-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">About</h2>
          <p className="whitespace-pre-line">{user.bio ?? "This dev hasn't written a bio yet. (´・ω・`)"}</p>
          {user.website ? (
            <a href={user.website} rel="nofollow noopener noreferrer" target="_blank" className="nav-link mt-4 inline-block font-bold text-accent">
              {user.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
            </a>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            Wearing <span className="text-ink">{theme.name}</span>
            {theme.ownerUsername && theme.ownerUsername !== user.username ? ` by @${theme.ownerUsername}` : ""}
          </h2>
          {visibleThemes.length ? (
            <>
              <h2 className="mt-4 text-sm font-bold uppercase tracking-wide text-muted">Themes by {user.username}</h2>
              <div className="stagger grid gap-4 sm:grid-cols-3">
                {visibleThemes.map((t) => (
                  <Tilt key={t.id} className="flex flex-col gap-2 rounded-xl">
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
