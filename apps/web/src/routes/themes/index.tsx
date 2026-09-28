import { createFileRoute, Link } from "@tanstack/react-router";
import type { Theme, User } from "@waifu-devs/domain/api";
import { BUILTIN_THEMES } from "@waifu-devs/domain/themes";
import { Trash2 } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { InlineMarkdown } from "@/components/Markdown";
import { Tilt } from "@/components/motion";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { title } from "@/lib/head";
import { deleteTheme, getThemes, wearTheme } from "@/server/functions";

export const Route = createFileRoute("/themes/")({
  loader: () => getThemes(),
  head: () => ({ meta: [title("Themes")] }),
  component: ThemesPage,
});

function ThemeCard({ theme, user, mine }: { theme: Theme; user: User | null; mine: boolean }) {
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
            {theme.builtin || !theme.ownerUsername ? (
              "Built-in"
            ) : (
              <Link to="/u/$username" params={{ username: theme.ownerUsername }} className="hover:text-primary">
                by u/{theme.ownerUsername}
              </Link>
            )}
            {theme.description ? (
              <>
                {" · "}
                <InlineMarkdown>{theme.description}</InlineMarkdown>
              </>
            ) : null}
          </p>
        </div>
        {user ? (
          <div className="mt-auto flex items-center gap-2">
            {wearing ? (
              <Badge className="rounded-full px-3 py-1">
                Wearing <span className="heartbeat">♡</span>
              </Badge>
            ) : (
              <ActionForm action={wearTheme}>
                <input type="hidden" name="theme_id" value={theme.id} />
                <Button size="sm" variant="outline" className="btn rounded-full font-bold" type="submit">
                  Wear this
                </Button>
              </ActionForm>
            )}
            {mine ? (
              <ActionForm action={deleteTheme} className="ml-auto">
                <input type="hidden" name="theme_id" value={theme.id} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" type="submit" aria-label="Delete theme">
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete theme</TooltipContent>
                </Tooltip>
              </ActionForm>
            ) : null}
          </div>
        ) : null}
      </Card>
    </Tilt>
  );
}

function ThemesPage() {
  const { user, community, mine } = Route.useLoaderData();
  const mineIds = new Set(mine.map((t) => t.id));
  const communityOthers = community.filter((t) => !mineIds.has(t.id));
  const grid = "stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  const card = (t: Theme) => <ThemeCard key={t.id} theme={t} user={user} mine={mineIds.has(t.id)} />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12">
      <div className="stagger flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Themes</h1>
          <p className="text-muted-foreground">
            Each theme is a full shadcn/ui token set. Wear one to restyle the site for you. Your profile shows it too, unless you pick a
            different profile theme when you customize your profile.
          </p>
        </div>
        <Button asChild className="btn rounded-full font-bold">
          {user ? <Link to="/themes/new">+ Make a theme</Link> : <Link to="/login" search={{ next: "/themes/new" }}>+ Make a theme</Link>}
        </Button>
      </div>

      {mine.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">Yours</h2>
          <div className={grid}>{mine.map(card)}</div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">Built-in</h2>
        <div className={grid}>{BUILTIN_THEMES.map(card)}</div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">From the community</h2>
        {communityOthers.length ? (
          <div className={grid}>{communityOthers.map(card)}</div>
        ) : (
          <p className="text-muted-foreground">No community themes yet. Make the first one!</p>
        )}
      </section>
    </main>
  );
}
