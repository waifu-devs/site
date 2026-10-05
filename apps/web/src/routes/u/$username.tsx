import { createFileRoute, Link } from "@tanstack/react-router";
import { Palette } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { InlineMarkdown, Markdown } from "@/components/Markdown";
import { Tilt } from "@/components/motion";
import { ProfileCard } from "@/components/ProfileCard";
import { FeaturedRepos } from "@/components/RepoCard";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { T, useI18n } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { useViewer } from "@/lib/viewer";
import { getProfile, wearTheme } from "@/server/functions";

export const Route = createFileRoute("/u/$username")({
  loader: ({ params }) => getProfile({ data: params.username }),
  head: ({ loaderData, matches }) => ({
    meta: loaderData
      ? [
          title(`${loaderData.user.displayName ?? loaderData.user.username} (u/${loaderData.user.username})`),
          { name: "theme-color", content: loaderData.theme.variant.tokens.background },
        ]
      : [title(headT(matches)("common.notFound.pageTitle"))],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, theme, themes, repos, isMe } = Route.useLoaderData();
  const { t } = useI18n();
  // The root document dresses the whole page in `theme`, so every visitor sees the owner's pick.
  const wearing = useViewer().theme.id === theme.id;
  const canWear = !isMe && !wearing && (theme.builtin || theme.isPublic !== false);

  return (
    <main className="stagger mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <ProfileCard
        profile={user}
        actions={
          isMe ? (
            <Button asChild variant="outline" className="btn rounded-full font-bold">
              <Link to="/settings">{t("profile.page.customize")}</Link>
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">{t("profile.page.about")}</CardTitle>
        </CardHeader>
        <CardContent>
          {user.bio ? <Markdown>{user.bio}</Markdown> : <p>{t("profile.page.noBio")}</p>}
        </CardContent>
      </Card>

      {repos.length ? <FeaturedRepos repos={repos} username={user.username} /> : null}

      <Card className="flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="w-full shrink-0 sm:w-44">
          <ThemeSwatch theme={theme} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Palette className="size-3.5" /> {t("profile.page.theme")}
          </p>
          <p className="text-lg font-extrabold">{theme.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {theme.builtin || !theme.ownerUsername ? (
              t("profile.page.builtIn")
            ) : (
              <Link to="/u/$username" params={{ username: theme.ownerUsername }} className="hover:text-primary">
                {t("profile.page.themeBy", { username: theme.ownerUsername })}
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
        {canWear ? (
          <ActionForm action={wearTheme} className="shrink-0">
            <input type="hidden" name="theme_id" value={theme.id} />
            <Button size="sm" variant="outline" className="btn rounded-full font-bold" type="submit">
              {t("profile.page.wearToo")}
            </Button>
          </ActionForm>
        ) : wearing && !isMe ? (
          <Badge className="shrink-0 rounded-full px-3 py-1">
            <T k="profile.page.wearingToo" values={{ heart: <span className="heartbeat">♡</span> }} />
          </Badge>
        ) : null}
      </Card>

      {themes.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("profile.page.themesBy", { username: user.username })}</h2>
          <div className="stagger grid gap-4 sm:grid-cols-3">
            {themes.map((th) => (
              <Tilt key={th.id} className="flex flex-col gap-2 rounded-lg">
                <ThemeSwatch theme={th} />
                <p className="text-sm font-bold">{th.name}</p>
              </Tilt>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
