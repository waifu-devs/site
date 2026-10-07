import { createFileRoute, Link } from "@tanstack/react-router";
import { TOKENS } from "@waifu-devs/domain/themes";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { TimeAgo } from "@/components/news/TimeAgo";
import { ThemePreview } from "@/components/ThemeEditor";
import { DeleteButton, DownloadButton, ThemeCard, ThemeStats, WearButton } from "@/components/themes/ThemeCard";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { useViewer } from "@/lib/viewer";
import { getThemeDetails } from "@/server/market";

export const Route = createFileRoute("/themes/$themeId")({
  loader: ({ params }) => getThemeDetails({ data: params.themeId }),
  head: ({ loaderData, matches }) => ({
    meta: [title(loaderData ? loaderData.theme.name : headT(matches)("themes.title"))],
  }),
  component: ThemePage,
});

function ThemePage() {
  const { theme, more } = Route.useLoaderData();
  const viewer = useViewer();
  const { t } = useI18n();
  const signedIn = !!viewer.user;
  const isMine = (ownerUsername?: string) => !!ownerUsername && ownerUsername.toLowerCase() === viewer.user?.username.toLowerCase();
  const mine = isMine(theme.ownerUsername);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12">
      <Link to="/themes" className="rise flex w-fit items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" /> {t("themes.detail.back")}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="stagger flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="flex flex-wrap items-center gap-3 text-4xl font-extrabold tracking-tight">
              <span className="gradient-text">{theme.name}</span>
              {theme.isPublic === false ? <Badge variant="outline">{t("themes.card.private")}</Badge> : null}
            </h1>
            <p className="text-sm text-muted-foreground">
              {theme.builtin || !theme.ownerUsername ? (
                t("themes.card.builtIn")
              ) : (
                <>
                  <Link to="/u/$username" params={{ username: theme.ownerUsername }} className="font-bold hover:text-primary">
                    {t("themes.card.by", { username: theme.ownerUsername })}
                  </Link>
                  {theme.createdAt ? (
                    <>
                      {" · "}
                      <TimeAgo date={theme.createdAt} />
                    </>
                  ) : null}
                </>
              )}
            </p>
          </div>

          {theme.description ? (
            <div className="text-muted-foreground">
              <Markdown>{theme.description}</Markdown>
            </div>
          ) : null}

          <ThemeStats theme={theme} mine={mine} signedIn={signedIn} />

          <div className="flex items-center gap-2">
            <WearButton themeId={theme.id} wearing={theme.id === viewer.theme.id} />
            <DownloadButton theme={theme} />
            {mine ? <DeleteButton themeId={theme.id} leave /> : null}
          </div>

          <Palette tokens={theme.variant.tokens} radius={theme.variant.radius} />
        </div>

        <div className="rise min-w-0">
          <ThemePreview variant={theme.variant} name={theme.name} />
        </div>
      </div>

      {more.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">
            {theme.builtin ? t("themes.detail.moreBuiltIn") : t("themes.detail.moreBy", { username: theme.ownerUsername ?? "" })}
          </h2>
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((other) => (
              <ThemeCard key={other.id} theme={other} wearing={other.id === viewer.theme.id} mine={isMine(other.ownerUsername)} signedIn={signedIn} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

/** Every token's color, each copied to the clipboard on click. */
function Palette({ tokens, radius }: { tokens: Record<(typeof TOKENS)[number], string>; radius: number }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(key: string, hex: string) {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1200);
    } catch {
      // No clipboard (an insecure page, or the browser said no): the hex is on screen anyway.
    }
  }

  return (
    <Card className="gap-3 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {t("themes.detail.palette")} · {t("themes.detail.radius", { radius })}
      </p>
      <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {TOKENS.map((key) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => copy(key, tokens[key])}
              aria-label={t("themes.detail.copy", { token: t(`themes.token.${key}`), hex: tokens[key] })}
              className="group flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-accent"
            >
              <span className="size-4 shrink-0 rounded-full border" style={{ background: tokens[key] }} />
              <span className="min-w-0 flex-1 truncate">{t(`themes.token.${key}`)}</span>
              <span className="font-mono text-muted-foreground">
                {copied === key ? <Check className="size-3 text-primary" /> : tokens[key]}
              </span>
              <Copy aria-hidden className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
