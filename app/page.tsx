import Link from "next/link";
import { MemberCard } from "@/components/MemberCard";
import { AvatarGroup, AvatarGroupTooltip } from "@/components/animate-ui/components/animate/avatar-group";
import { BubbleBackground } from "@/components/animate-ui/components/backgrounds/bubble";
import { Magnetic } from "@/components/animate-ui/primitives/effects/magnetic";
import { RotatingText, RotatingTextContainer } from "@/components/animate-ui/primitives/texts/rotating";
import { SlidingNumber } from "@/components/animate-ui/primitives/texts/sliding-number";
import { Reveal, Tilt } from "@/components/motion";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { countMembers, getTheme, listCommunityThemes, listMembers } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { BUILTIN_THEMES, mix, type ThemeTokens } from "@/lib/themes";

const PHRASES = ["ship together", "debug at 3am", "rewrite in Rust", "defend best girl", "deploy Fridays"];

export default async function Home() {
  const [user, members, memberCount, communityThemes] = await Promise.all([
    currentUser(),
    listMembers(8),
    countMembers(),
    listCommunityThemes(4),
  ]);
  const theme = await getTheme(user?.theme_id);
  const themes = [...communityThemes, ...BUILTIN_THEMES].slice(0, 4);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-20 px-4 py-14">
      <section data-sparkle-zone className="relative isolate overflow-hidden rounded-3xl border bg-card shadow-sm">
        <BubbleBackground
          interactive
          colors={bubbleColors(theme.variant.tokens)}
          className="absolute inset-0 -z-10 bg-none opacity-45"
        />
        <div className="grid items-center gap-10 p-6 sm:p-12 md:grid-cols-[1.4fr_1fr]">
          <div className="stagger flex flex-col items-start gap-5">
            <Badge variant="outline" className="rounded-full bg-card/80 px-3 py-1 text-primary backdrop-blur">
              (✿◕‿◕✿) <SlidingNumber number={memberCount} /> {memberCount === 1 ? "dev" : "devs"} and counting
            </Badge>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
              Where devs who love their waifus
              <RotatingTextContainer text={PHRASES} duration={2600} className="min-h-[1.3em]">
                <RotatingText className="gradient-text whitespace-nowrap" />
              </RotatingTextContainer>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Make a profile, show off your best girl, and dress the whole site in a theme you designed yourself.
            </p>
            <div className="flex flex-wrap gap-3">
              <Magnetic strength={0.3}>
                <Button asChild size="lg" className="btn rounded-full font-bold">
                  {user ? <Link href={`/u/${user.username}`}>View my profile</Link> : <Link href="/login">Join with GitHub ♡</Link>}
                </Button>
              </Magnetic>
              <Magnetic strength={0.3}>
                <Button asChild size="lg" variant="outline" className="btn rounded-full bg-card/80 font-bold backdrop-blur">
                  <Link href="/themes">Browse themes</Link>
                </Button>
              </Magnetic>
            </div>
            {members.length ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <AvatarGroup className="h-10 -space-x-2">
                  {members.slice(0, 6).map((m) => (
                    <Avatar key={m.id} className="size-10 border-2 border-background">
                      {m.avatar_url ? <AvatarImage src={`${m.avatar_url}?s=80`} alt="" /> : null}
                      <AvatarFallback className="bg-primary font-bold text-primary-foreground">
                        {m.username.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                      <AvatarGroupTooltip>u/{m.username}</AvatarGroupTooltip>
                    </Avatar>
                  ))}
                </AvatarGroup>
                <span>just joined</span>
              </div>
            ) : null}
          </div>

          <HeroCard />
        </div>
      </section>

      <Reveal className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-extrabold">Newest members</h2>
          <Link href="/members" className="nav-link text-sm font-bold text-primary">See all →</Link>
        </div>
        {members.length ? (
          <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {members.map((m) => <MemberCard key={m.id} user={m} />)}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
            No one here yet. Be the first! <span className="float inline-block">(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</span>
          </p>
        )}
      </Reveal>

      <Reveal className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-extrabold">Themes</h2>
          <Link href="/themes" className="nav-link text-sm font-bold text-primary">All themes →</Link>
        </div>
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {themes.map((t) => (
            <Tilt key={t.id} className="rounded-2xl">
              <Link href="/themes" className="flex flex-col gap-2">
                <ThemeSwatch theme={t} />
                <p className="text-sm font-bold">
                  {t.name} <span className="font-normal text-muted-foreground">{t.builtin ? "built-in" : `by @${t.ownerUsername}`}</span>
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
            <Tilt key={f.title} className="rounded-xl">
              <Card className="h-full gap-0 p-6">
                <span className="float mb-3 grid h-12 w-12 place-items-center rounded-lg bg-primary text-2xl text-primary-foreground">{f.icon}</span>
                <h3 className="text-lg font-extrabold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </Card>
            </Tilt>
          ))}
        </div>
      </Reveal>
    </main>
  );
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

/** Bubble colors drawn from the viewer's theme, so the hero matches whatever they wear. */
function bubbleColors(t: ThemeTokens) {
  return {
    first: rgb(t.primary),
    second: rgb(mix(t.primary, "#a78bfa", 0.5)),
    third: rgb(mix(t.primary, "#7dd3fc", 0.45)),
    fourth: rgb(t.ring),
    fifth: rgb(mix(t.primary, "#f9a8d4", 0.5)),
    sixth: rgb(t.accent),
  };
}

/** A floating mock profile card that shows off the current theme. */
function HeroCard() {
  return (
    <div className="float relative mx-auto w-full max-w-xs" style={{ animationDuration: "6s" }}>
      <Tilt max={14} className="rounded-xl">
        <Card className="gap-0 p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-2xl text-primary-foreground">✿</span>
          <div>
            <p className="font-extrabold">you, but cuter</p>
            <p className="text-xs text-muted-foreground">u/you · joined today</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Badge className="heartbeat">♡ best girl</Badge>
          <Badge variant="secondary">she/her</Badge>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <div className="h-2 w-5/6 rounded-full bg-border" />
          <div className="h-2 w-2/3 rounded-full bg-border" />
          <div className="h-2 w-3/4 rounded-full bg-border" />
        </div>
        </Card>
      </Tilt>
      <span aria-hidden className="float absolute -right-4 -top-5 text-3xl text-primary" style={{ animationDelay: "-1s" }}>✦</span>
      <span aria-hidden className="float absolute -bottom-4 -left-5 text-2xl text-primary" style={{ animationDelay: "-2.5s" }}>❀</span>
    </div>
  );
}
