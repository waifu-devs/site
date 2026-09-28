import type { Metadata } from "next";
import Link from "next/link";
import { Tilt } from "@/components/motion";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { deleteTheme, wearTheme } from "@/lib/actions";
import { listCommunityThemes, listThemesByOwner } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { BUILTIN_THEMES, type Theme } from "@/lib/themes";

export const metadata: Metadata = { title: "Themes" };

export default async function ThemesPage() {
  const user = await currentUser();
  const [community, mine] = await Promise.all([listCommunityThemes(), user ? listThemesByOwner(user.id) : []]);
  const mineIds = new Set(mine.map((t) => t.id));

  function Card({ theme }: { theme: Theme }) {
    const wearing = user?.theme_id === theme.id;
    return (
      <Tilt className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
        <ThemeSwatch theme={theme} />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold">
              {theme.name}
              {theme.isPublic === false ? <span className="ml-1 text-xs font-normal text-muted">(private)</span> : null}
            </p>
            <p className="truncate text-xs text-muted">
              {theme.builtin ? "Built-in" : <Link href={`/u/${theme.ownerUsername}`} className="hover:text-accent">by @{theme.ownerUsername}</Link>}
              {theme.description ? ` · ${theme.description}` : ""}
            </p>
          </div>
        </div>
        {user ? (
          <div className="flex gap-2">
            {wearing ? (
              <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">Wearing <span className="heartbeat">♡</span></span>
            ) : (
              <form action={wearTheme}>
                <input type="hidden" name="theme_id" value={theme.id} />
                <button className="btn cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-bold hover:border-accent" type="submit">
                  Wear this
                </button>
              </form>
            )}
            {mineIds.has(theme.id) ? (
              <form action={deleteTheme}>
                <input type="hidden" name="theme_id" value={theme.id} />
                <button className="cursor-pointer rounded-full px-3 py-1 text-xs text-muted transition-colors hover:text-accent" type="submit">
                  Delete
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </Tilt>
    );
  }

  const grid = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  const communityOthers = community.filter((t) => !mineIds.has(t.id));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12">
      <div className="stagger flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Themes</h1>
          <p className="text-muted">Wear one to restyle the whole site for you, and your profile for everyone who visits it.</p>
        </div>
        <Link
          href={user ? "/themes/new" : "/login?next=/themes/new"}
          className="btn rounded-full bg-accent px-5 py-2 font-bold text-on-accent"
        >
          + Make a theme
        </Link>
      </div>

      {mine.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">Yours</h2>
          <div className={`stagger ${grid}`}>{mine.map((t) => <Card key={t.id} theme={t} />)}</div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">Built-in</h2>
        <div className={`stagger ${grid}`}>{BUILTIN_THEMES.map((t) => <Card key={t.id} theme={t} />)}</div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">From the community</h2>
        {communityOthers.length ? (
          <div className={`stagger ${grid}`}>{communityOthers.map((t) => <Card key={t.id} theme={t} />)}</div>
        ) : (
          <p className="text-muted">No community themes yet. Make the first one!</p>
        )}
      </section>
    </main>
  );
}
