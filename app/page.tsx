import Link from "next/link";
import { MemberCard } from "@/components/MemberCard";
import { CountUp, Reveal, Tilt, Typewriter } from "@/components/motion";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { countMembers, listCommunityThemes, listMembers } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { BUILTIN_THEMES } from "@/lib/themes";

const PHRASES = ["ship together", "debug at 3am", "rewrite in Rust", "defend best girl", "deploy Fridays"];

export default async function Home() {
  const [user, members, memberCount, communityThemes] = await Promise.all([
    currentUser(),
    listMembers(8),
    countMembers(),
    listCommunityThemes(4),
  ]);
  const themes = [...communityThemes, ...BUILTIN_THEMES].slice(0, 4);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-20 px-4 py-14">
      <section data-sparkle-zone className="relative isolate">
        <div aria-hidden className="pointer-events-none absolute -inset-x-20 -top-20 -bottom-10 -z-10">
          <div className="blob left-[5%] top-[10%] h-64 w-64" />
          <div className="blob b2 right-[8%] top-[0%] h-72 w-72" />
          <div className="blob b3 bottom-[0%] left-[40%] h-56 w-56" />
        </div>

        <div className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
          <div className="stagger flex flex-col items-start gap-5">
            <p className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-accent">
              (✿◕‿◕✿) <CountUp value={memberCount} /> {memberCount === 1 ? "dev" : "devs"} and counting
            </p>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">
              Where devs who love their waifus{" "}
              <span className="gradient-text block min-h-[1.25em]"><Typewriter phrases={PHRASES} /></span>
            </h1>
            <p className="max-w-2xl text-lg text-muted">
              Make a profile, show off your best girl, and dress the whole site in a theme you designed yourself.
            </p>
            <div className="flex flex-wrap gap-3">
              {user ? (
                <Link href={`/u/${user.username}`} className="btn rounded-full bg-accent px-6 py-3 font-bold text-on-accent">
                  View my profile
                </Link>
              ) : (
                <Link href="/login" className="btn rounded-full bg-accent px-6 py-3 font-bold text-on-accent">
                  Join with GitHub ♡
                </Link>
              )}
              <Link href="/themes" className="btn rounded-full border border-line bg-surface px-6 py-3 font-bold">
                Browse themes
              </Link>
            </div>
          </div>

          <HeroCard />
        </div>
      </section>

      <Reveal className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-extrabold">Newest members</h2>
          <Link href="/members" className="nav-link text-sm font-bold text-accent">See all →</Link>
        </div>
        {members.length ? (
          <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {members.map((m) => <MemberCard key={m.id} user={m} />)}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
            No one here yet. Be the first! <span className="float inline-block">(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</span>
          </p>
        )}
      </Reveal>

      <Reveal className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-extrabold">Themes</h2>
          <Link href="/themes" className="nav-link text-sm font-bold text-accent">All themes →</Link>
        </div>
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {themes.map((t) => (
            <Tilt key={t.id} className="rounded-2xl">
              <Link href="/themes" className="flex flex-col gap-2">
                <ThemeSwatch theme={t} />
                <p className="text-sm font-bold">
                  {t.name} <span className="font-normal text-muted">{t.builtin ? "built-in" : `by @${t.ownerUsername}`}</span>
                </p>
              </Link>
            </Tilt>
          ))}
        </div>
      </Reveal>

      <Reveal>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: "♡", title: "Your profile", body: "Bio, pronouns, links and your favorite waifu, front and center." },
            { icon: "✦", title: "Your colors", body: "Design a theme in the live editor. It follows you across the whole site." },
            { icon: "❀", title: "Your people", body: "Find other devs who get it, and borrow the themes they make." },
          ].map((f) => (
            <Tilt key={f.title} className="rounded-3xl border border-line bg-surface p-6">
              <span className="float mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent text-2xl text-on-accent">{f.icon}</span>
              <h3 className="text-lg font-extrabold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </Tilt>
          ))}
        </div>
      </Reveal>
    </main>
  );
}

/** A floating mock profile card that shows off the current theme. */
function HeroCard() {
  return (
    <div className="float relative mx-auto w-full max-w-xs" style={{ animationDuration: "6s" }}>
      <Tilt max={14} className="rounded-3xl border border-line bg-surface p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-2xl text-on-accent">✿</span>
          <div>
            <p className="font-extrabold">you, but cuter</p>
            <p className="text-xs text-muted">@you · joined today</p>
          </div>
        </div>
        <p className="heartbeat mt-4 rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">♡ best girl</p>
        <div className="mt-4 flex flex-col gap-2">
          <div className="h-2 w-5/6 rounded-full bg-line" />
          <div className="h-2 w-2/3 rounded-full bg-line" />
          <div className="h-2 w-3/4 rounded-full bg-line" />
        </div>
      </Tilt>
      <span aria-hidden className="float absolute -right-4 -top-5 text-3xl text-accent" style={{ animationDelay: "-1s" }}>✦</span>
      <span aria-hidden className="float absolute -bottom-4 -left-5 text-2xl text-accent" style={{ animationDelay: "-2.5s" }}>❀</span>
    </div>
  );
}
