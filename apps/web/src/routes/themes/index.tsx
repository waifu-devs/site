import { createFileRoute, Link } from "@tanstack/react-router";
import { THEME_MAX_PAGE, THEME_PAGE_SIZE } from "@waifu-devs/domain/api";
import { colorOf, cornersOf, modeOf } from "@waifu-devs/domain/themes";
import { Plus, X } from "lucide-react";
import { AnimatePresence, m as motion } from "motion/react";
import { Magnetic } from "@/components/animate-ui/primitives/effects/magnetic";
import { FilterBar, Pager, SearchBox, SortTabs } from "@/components/themes/MarketControls";
import { ThemeCard } from "@/components/themes/ThemeCard";
import { activeFilters, type MarketSearch, parseSearch, toSearch, type View } from "@/components/themes/view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { cn } from "@/lib/utils";
import { useViewer } from "@/lib/viewer";
import { getMarket } from "@/server/market";

const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

export const Route = createFileRoute("/themes/")({
  validateSearch: (search: Record<string, unknown>): MarketSearch => toSearch(parseSearch(search)),
  loaderDeps: ({ search }) => parseSearch(search),
  loader: ({ deps }) => getMarket({ data: deps }),
  head: ({ matches }) => ({ meta: [title(headT(matches)("themes.title"))] }),
  component: ThemesPage,
});

function ThemesPage() {
  const { themes, total, builtins, mine } = Route.useLoaderData();
  const view = parseSearch(Route.useSearch());
  const { sort, q, page, filters } = view;
  const viewer = useViewer();
  // The theme the site is dressed in: the member's, or the one this browser picked while signed out.
  const worn = viewer.theme.id;
  const signedIn = !!viewer.user;
  const { t } = useI18n();
  const mineIds = new Set(mine.map((theme) => theme.id));
  const isMine = (ownerUsername?: string) => !!ownerUsername && ownerUsername.toLowerCase() === viewer.user?.username.toLowerCase();
  const grid = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  const filtered = activeFilters(filters) > 0;
  // Medals only make sense for the whole marketplace's ranking.
  const ranked = sort !== "new" && page === 1 && !q && !filtered;
  const offset = (page - 1) * THEME_PAGE_SIZE;
  const pages = Math.min(Math.max(1, Math.ceil(total / THEME_PAGE_SIZE)), THEME_MAX_PAGE);
  // The built-ins that pass the look, color and corner filters (the API leaves them out for the others).
  const shownBuiltins = builtins.filter(
    (theme) =>
      (!filters.mode || modeOf(theme.variant.tokens) === filters.mode) &&
      (!filters.color || colorOf(theme.variant.tokens) === filters.color) &&
      (!filters.corners || cornersOf(theme.variant.radius) === filters.corners),
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <MarketHeader signedIn={signedIn} />

      <div className="rise flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SortTabs view={view} />
        <SearchBox view={view} />
      </div>

      <FilterBar view={view} signedIn={signedIn} />

      <section className="mt-2 flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-xl font-extrabold">{q ? t("themes.index.results", { q }) : t("themes.index.community")}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("themes.index.count", { count: total })}
            {pages > 1 ? ` · ${t("themes.index.pageOf", { page, pages })}` : null}
          </p>
        </div>
        {/* The grid stays mounted (hidden while empty) so cards can animate out. */}
        <div className={cn(grid, "empty:hidden")}>
          <AnimatePresence mode="popLayout">
            {themes.map((theme, i) => (
              <motion.div
                key={theme.id}
                // Switching sorts and filters slides the themes both lists share into their new places.
                layout="position"
                initial={{ opacity: 0, y: 18, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                transition={{ default: { ...spring, delay: Math.min(i, 12) * 0.03 }, layout: spring }}
                className="min-w-0"
              >
                <ThemeCard
                  theme={theme}
                  wearing={theme.id === worn}
                  mine={isMine(theme.ownerUsername)}
                  signedIn={signedIn}
                  rank={ranked ? offset + i + 1 : undefined}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {themes.length ? null : <NoThemes view={view} signedIn={signedIn} />}
        {pages > 1 ? <Pager view={view} pages={pages} /> : null}
      </section>

      {/* Your themes (private ones too) and the built-ins, while browsing the first page. */}
      {mine.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">{t("themes.index.yours")}</h2>
          <div className={cn("stagger", grid)}>
            {mine.map((theme) => (
              <ThemeCard key={theme.id} theme={theme} wearing={theme.id === worn} mine={mineIds.has(theme.id)} signedIn={signedIn} />
            ))}
          </div>
        </section>
      ) : null}

      {shownBuiltins.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">{t("themes.index.builtIn")}</h2>
          <div className={cn("stagger", grid)}>
            {shownBuiltins.map((theme) => (
              <ThemeCard key={theme.id} theme={theme} wearing={theme.id === worn} mine={false} signedIn={signedIn} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function MarketHeader({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();
  return (
    <header data-sparkle-zone className="relative isolate">
      {/* The glows drift past the content edges; this screen-wide layer clips them at the
          screen's edges, so they never make the page wider than a phone. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-x-clip">
        <div className="relative mx-auto h-full max-w-5xl px-4">
          <div className="blob -left-16 -top-24 h-64 w-64" />
          <div className="blob b2 -top-10 right-4 h-44 w-44" />
        </div>
      </div>
      <div className="stagger flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="float w-fit text-2xl text-primary">(っ◔◡◔)っ ♡</p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            <span className="gradient-text">{t("themes.index.heading")}</span>
          </h1>
          <p className="text-muted-foreground">
            {t("themes.index.intro")} {signedIn ? t("themes.index.introSignedIn") : t("themes.index.introSignedOut")} {t("themes.index.introFuwa")}
          </p>
        </div>
        <Magnetic strength={0.3}>
          <Button asChild className="btn rounded-full font-bold">
            {signedIn ? (
              <Link to="/themes/new">
                <Plus /> {t("themes.index.make")}
              </Link>
            ) : (
              <Link to="/login" search={{ next: "/themes/new" }}>
                <Plus /> {t("themes.index.make")}
              </Link>
            )}
          </Button>
        </Magnetic>
      </div>
    </header>
  );
}

/** Nothing to show: nothing matched, the member paged past the end, or nobody has shared a theme yet. */
function NoThemes({ view, signedIn }: { view: View; signedIn: boolean }) {
  const { t } = useI18n();
  const filtered = activeFilters(view.filters) > 0;
  const [heading, body] = view.q
    ? [t("themes.index.noMatchTitle"), t("themes.index.noMatchBody", { q: view.q })]
    : filtered
      ? [t("themes.index.noMatchTitle"), t("themes.filters.noMatch")]
      : view.page > 1
        ? [t("themes.index.endTitle"), t("themes.index.endBody")]
        : [t("themes.index.emptyTitle"), t("themes.index.noCommunity")];
  return (
    <Card className="rise items-center gap-3 px-6 py-14 text-center">
      <p className="float text-5xl">(・_・;)</p>
      <h3 className="text-xl font-extrabold">{heading}</h3>
      <p className="max-w-sm text-muted-foreground">{body}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {filtered || view.q ? (
          <Button asChild variant="outline" className="btn rounded-full font-bold">
            <Link to="/themes" search={toSearch({ ...view, q: "", page: 1, filters: {} })}>
              <X /> {view.q ? t("themes.filters.clearAll") : t("themes.filters.clear")}
            </Link>
          </Button>
        ) : null}
        <Button asChild className="btn rounded-full font-bold">
          {signedIn ? (
            <Link to="/themes/new">
              <Plus /> {t("themes.index.make")}
            </Link>
          ) : (
            <Link to="/login" search={{ next: "/themes/new" }}>
              <Plus /> {t("themes.index.make")}
            </Link>
          )}
        </Button>
      </div>
    </Card>
  );
}
