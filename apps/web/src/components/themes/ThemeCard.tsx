import { Link } from "@tanstack/react-router";
import type { MarketTheme, Theme } from "@waifu-devs/domain/api";
import { Download, Shirt, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { InlineMarkdown } from "@/components/Markdown";
import { Tilt } from "@/components/motion";
import { VoteButton } from "@/components/news/VoteButton";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { T, useI18n } from "@/i18n/react";
import { downloadForFuwa } from "@/lib/fuwa-theme";
import { cn } from "@/lib/utils";
import { deleteTheme, wearTheme } from "@/server/functions";

const DAY = 24 * 60 * 60 * 1000;
const MEDALS = ["🥇", "🥈", "🥉"];

const isMarket = (theme: Theme | MarketTheme): theme is MarketTheme => "score" in theme;

/**
 * A theme in the marketplace: its swatch (in to its page), who made it, its hearts
 * and wearers when we know them, and Wear, Download and (for its maker) Delete.
 */
export function ThemeCard({
  theme,
  wearing,
  mine,
  signedIn,
  rank,
}: {
  theme: Theme | MarketTheme;
  wearing: boolean;
  mine: boolean;
  signedIn: boolean;
  /** Its place in a ranked list; the first three get a medal. */
  rank?: number;
}) {
  const { t } = useI18n();
  const market = isMarket(theme) ? theme : null;
  const fresh = market?.createdAt ? Date.now() - new Date(market.createdAt).getTime() < 3 * DAY : false;
  const medal = rank !== undefined ? MEDALS[rank - 1] : undefined;

  return (
    // min-w-0: a long one-line description would otherwise widen its grid column past a phone screen.
    <Tilt className="min-w-0 rounded-xl">
      <Card className={cn("h-full gap-3 p-3", medal && "border-primary/60")}>
        <Link to="/themes/$themeId" params={{ themeId: theme.id }} aria-label={t("themes.card.open", { name: theme.name })}>
          <ThemeSwatch theme={theme} />
        </Link>
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold">
            {medal ? (
              <span role="img" aria-label={t("themes.card.rank", { rank: rank! })} className="text-lg leading-none">
                {medal}
              </span>
            ) : null}
            <Link to="/themes/$themeId" params={{ themeId: theme.id }} className="truncate hover:text-primary">
              {theme.name}
            </Link>
            {theme.isPublic === false ? <Badge variant="outline">{t("themes.card.private")}</Badge> : null}
            {fresh ? <Badge variant="secondary">{t("themes.card.new")}</Badge> : null}
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
        {market ? <ThemeStats theme={market} mine={mine} signedIn={signedIn} /> : null}
        <div className="mt-auto flex items-center gap-2">
          <WearButton themeId={theme.id} wearing={wearing} />
          <DownloadButton theme={theme} className="ml-auto" />
          {mine ? <DeleteButton themeId={theme.id} /> : null}
        </div>
      </Card>
    </Tilt>
  );
}

/** Hearts (a button, for members' themes) and how many members wear it. */
export function ThemeStats({ theme, mine, signedIn, className }: { theme: MarketTheme; mine: boolean; signedIn: boolean; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn("flex items-center gap-3 text-sm text-muted-foreground", className)}>
      {theme.builtin ? null : (
        <VoteButton
          target={{ kind: "theme", id: theme.id }}
          score={theme.score}
          voted={theme.voted}
          mine={mine}
          signedIn={signedIn}
          className="w-auto flex-row gap-1.5 rounded-full px-3 py-1"
        />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1.5 font-bold tabular-nums">
            <Shirt className="size-4" aria-hidden />
            {t("themes.card.wearers", { count: theme.wearers })}
          </span>
        </TooltipTrigger>
        <TooltipContent>{t("themes.card.wearersTip", { count: theme.wearers })}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function WearButton({ themeId, wearing, className }: { themeId: string; wearing: boolean; className?: string }) {
  const { t } = useI18n();
  return wearing ? (
    <Badge className={cn("rounded-full px-3 py-1", className)}>
      <T k="themes.card.wearing" values={{ heart: <span className="heartbeat">♡</span> }} />
    </Badge>
  ) : (
    <ActionForm action={wearTheme} className={className}>
      <input type="hidden" name="theme_id" value={themeId} />
      <Button size="sm" variant="outline" className="btn rounded-full font-bold" type="submit">
        {t("themes.card.wear")}
      </Button>
    </ActionForm>
  );
}

export function DownloadButton({ theme, className }: { theme: Theme; className?: string }) {
  const { t } = useI18n();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn("size-8 text-muted-foreground hover:text-primary [&_svg]:transition-transform hover:[&_svg]:translate-y-0.5", className)}
          type="button"
          aria-label={t("themes.card.download")}
          onClick={() => downloadForFuwa(theme)}
        >
          <Download />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("themes.card.download")}</TooltipContent>
    </Tooltip>
  );
}

/** `leave`: it's on the theme's own page, which goes away with it. */
export function DeleteButton({ themeId, leave = false }: { themeId: string; leave?: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={deleteTheme}>
      <input type="hidden" name="theme_id" value={themeId} />
      {leave ? <input type="hidden" name="leave" value="1" /> : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" type="submit" aria-label={t("themes.card.delete")}>
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("themes.card.delete")}</TooltipContent>
      </Tooltip>
    </ActionForm>
  );
}
