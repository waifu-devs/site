import Link from "next/link";
import { MemberCard } from "@/components/MemberCard";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { countMembers, listCommunityThemes, listMembers } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { BUILTIN_THEMES } from "@/lib/themes";

export default async function Home() {
  const [user, members, memberCount, communityThemes] = await Promise.all([
    currentUser(),
    listMembers(8),
    countMembers(),
    listCommunityThemes(4),
  ]);
  const themes = [...communityThemes, ...BUILTIN_THEMES].slice(0, 4);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-16 px-4 py-14">
      <section className="flex flex-col items-start gap-5">
        <p className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-accent">
          (✿◕‿◕✿) {memberCount} {memberCount === 1 ? "dev" : "devs"} and counting
        </p>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">
          Where devs who love their waifus <span className="text-accent">ship code together</span>.
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Make a profile, show off your best girl, and dress the whole site in a theme you designed yourself.
        </p>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <Link href={`/u/${user.username}`} className="rounded-full bg-accent px-6 py-3 font-bold text-on-accent hover:opacity-90">
              View my profile
            </Link>
          ) : (
            <Link href="/login" className="rounded-full bg-accent px-6 py-3 font-bold text-on-accent hover:opacity-90">
              Join with GitHub
            </Link>
          )}
          <Link href="/themes" className="rounded-full border border-line bg-surface px-6 py-3 font-bold hover:border-accent">
            Browse themes
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-extrabold">Newest members</h2>
          <Link href="/members" className="text-sm font-bold text-accent">See all →</Link>
        </div>
        {members.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {members.map((m) => <MemberCard key={m.id} user={m} />)}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
            No one here yet. Be the first! (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-extrabold">Themes</h2>
          <Link href="/themes" className="text-sm font-bold text-accent">All themes →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {themes.map((t) => (
            <div key={t.id} className="flex flex-col gap-2">
              <ThemeSwatch theme={t} />
              <p className="text-sm font-bold">
                {t.name} <span className="font-normal text-muted">{t.builtin ? "built-in" : `by @${t.ownerUsername}`}</span>
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
