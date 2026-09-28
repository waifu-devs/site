import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Tilt } from "@/components/motion";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteTheme, wearTheme } from "@/lib/actions";
import { listCommunityThemes, listThemesByOwner } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { BUILTIN_THEMES, type Theme } from "@/lib/themes";

export const metadata: Metadata = { title: "Themes" };

export default async function ThemesPage() {
  const user = await currentUser();
  const [community, mine] = await Promise.all([listCommunityThemes(), user ? listThemesByOwner(user.id) : []]);
  const mineIds = new Set(mine.map((t) => t.id));

  function ThemeCard({ theme }: { theme: Theme }) {
    const wearing = user?.themeId === theme.id;
    return (
      <Tilt className="rounded-xl">
        <Card className="h-full gap-3 p-3">
          <ThemeSwatch theme={theme} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-bold">
              {theme.name}
              {theme.isPublic === false ? <Badge variant="outline">private</Badge> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {theme.builtin ? "Built-in" : <Link href={`/u/${theme.ownerUsername}`} className="hover:text-primary">by u/{theme.ownerUsername}</Link>}
              {theme.description ? ` · ${theme.description}` : ""}
            </p>
          </div>
          {user ? (
            <div className="mt-auto flex items-center gap-2">
              {wearing ? (
                <Badge className="rounded-full px-3 py-1">Wearing <span className="heartbeat">♡</span></Badge>
              ) : (
                <form action={wearTheme}>
                  <input type="hidden" name="theme_id" value={theme.id} />
                  <Button size="sm" variant="outline" className="btn rounded-full font-bold" type="submit">
                    Wear this
                  </Button>
                </form>
              )}
              {mineIds.has(theme.id) ? (
                <form action={deleteTheme} className="ml-auto">
                  <input type="hidden" name="theme_id" value={theme.id} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" type="submit" aria-label="Delete theme">
                        <Trash2 />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete theme</TooltipContent>
                  </Tooltip>
                </form>
              ) : null}
            </div>
          ) : null}
        </Card>
      </Tilt>
    );
  }

  const grid = "stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  const communityOthers = community.filter((t) => !mineIds.has(t.id));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12">
      <div className="stagger flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Themes</h1>
          <p className="text-muted-foreground">Each theme is a full shadcn/ui token set. Wear one to restyle the site for you, and your profile for everyone who visits it.</p>
        </div>
        <Button asChild className="btn rounded-full font-bold">
          <Link href={user ? "/themes/new" : "/login?next=/themes/new"}>+ Make a theme</Link>
        </Button>
      </div>

      {mine.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">Yours</h2>
          <div className={grid}>{mine.map((t) => <ThemeCard key={t.id} theme={t} />)}</div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">Built-in</h2>
        <div className={grid}>{BUILTIN_THEMES.map((t) => <ThemeCard key={t.id} theme={t} />)}</div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">From the community</h2>
        {communityOthers.length ? (
          <div className={grid}>{communityOthers.map((t) => <ThemeCard key={t.id} theme={t} />)}</div>
        ) : (
          <p className="text-muted-foreground">No community themes yet. Make the first one!</p>
        )}
      </section>
    </main>
  );
}
