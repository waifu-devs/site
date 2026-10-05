import { createFileRoute, Link } from "@tanstack/react-router";
import type { Theme } from "@waifu-devs/domain/api";
import { BUILTIN_THEMES } from "@waifu-devs/domain/themes";
import { Download, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { InlineMarkdown } from "@/components/Markdown";
import { Tilt } from "@/components/motion";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { downloadForFuwa } from "@/lib/fuwa-theme";
import { T, useI18n } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { useViewer } from "@/lib/viewer";
import { deleteTheme, getThemes, wearTheme } from "@/server/functions";

export const Route = createFileRoute("/themes/")({
  loader: () => getThemes(),
  head: ({ matches }) => ({ meta: [title(headT(matches)("themes.title"))] }),
  component: ThemesPage,
});

function ThemeCard({ theme, wearing, mine }: { theme: Theme; wearing: boolean; mine: boolean }) {
  const { t } = useI18n();
  return (
    // min-w-0: a long one-line description would otherwise widen its grid column past a phone screen.
    <Tilt className="min-w-0 rounded-xl">
      <Card className="h-full gap-3 p-3">
        <ThemeSwatch theme={theme} />
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold">
            {theme.name}
            {theme.isPublic === false ? <Badge variant="outline">{t("themes.card.private")}</Badge> : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {theme.builtin || !theme.ownerUsername ? (
              t("themes.card.builtIn")
            ) : (
              <Link to="/u/$username" params={{ username: theme.ownerUsername }} className="hover:text-primary">
                {t("themes.card.by", { username: theme.ownerUsername })}
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
        <div className="mt-auto flex items-center gap-2">
          {wearing ? (
            <Badge className="rounded-full px-3 py-1">
              <T k="themes.card.wearing" values={{ heart: <span className="heartbeat">♡</span> }} />
            </Badge>
          ) : (
            <ActionForm action={wearTheme}>
              <input type="hidden" name="theme_id" value={theme.id} />
              <Button size="sm" variant="outline" className="btn rounded-full font-bold" type="submit">
                {t("themes.card.wear")}
              </Button>
            </ActionForm>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto size-8 text-muted-foreground hover:text-primary [&_svg]:transition-transform hover:[&_svg]:translate-y-0.5"
                type="button"
                aria-label={t("themes.card.download")}
                onClick={() => downloadForFuwa(theme)}
              >
                <Download />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("themes.card.download")}</TooltipContent>
          </Tooltip>
          {mine ? (
            <ActionForm action={deleteTheme}>
              <input type="hidden" name="theme_id" value={theme.id} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" type="submit" aria-label={t("themes.card.delete")}>
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("themes.card.delete")}</TooltipContent>
              </Tooltip>
            </ActionForm>
          ) : null}
        </div>
      </Card>
    </Tilt>
  );
}

function ThemesPage() {
  const { user, community, mine } = Route.useLoaderData();
  // The theme the site is dressed in: the member's, or the one this browser picked while signed out.
  const worn = useViewer().theme.id;
  const { t } = useI18n();
  const mineIds = new Set(mine.map((theme) => theme.id));
  const communityOthers = community.filter((theme) => !mineIds.has(theme.id));
  const grid = "stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  const card = (theme: Theme) => <ThemeCard key={theme.id} theme={theme} wearing={theme.id === worn} mine={mineIds.has(theme.id)} />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12">
      <div className="stagger flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">{t("themes.title")}</h1>
          <p className="text-muted-foreground">
            {t("themes.index.intro")} {user ? t("themes.index.introSignedIn") : t("themes.index.introSignedOut")} {t("themes.index.introFuwa")}
          </p>
        </div>
        <Button asChild className="btn rounded-full font-bold">
          {user ? (
            <Link to="/themes/new">{t("themes.index.make")}</Link>
          ) : (
            <Link to="/login" search={{ next: "/themes/new" }}>
              {t("themes.index.make")}
            </Link>
          )}
        </Button>
      </div>

      {mine.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">{t("themes.index.yours")}</h2>
          <div className={grid}>{mine.map(card)}</div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">{t("themes.index.builtIn")}</h2>
        <div className={grid}>{BUILTIN_THEMES.map(card)}</div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">{t("themes.index.community")}</h2>
        {communityOthers.length ? (
          <div className={grid}>{communityOthers.map(card)}</div>
        ) : (
          <p className="text-muted-foreground">{t("themes.index.noCommunity")}</p>
        )}
      </section>
    </main>
  );
}
