import { Link, useNavigate } from "@tanstack/react-router";
import type { ThemeFilters } from "@waifu-devs/domain/api";
import { COLOR_SWATCHES, THEME_COLORS, THEME_CORNERS, THEME_PERIODS } from "@waifu-devs/domain/themes";
import { ArrowLeft, ArrowRight, Clock, Flame, Heart, Moon, Search, Shirt, SlidersHorizontal, Sun, X } from "lucide-react";
import { m as motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Key, useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { activeFilters, pageNumbers, SORTS, toSearch, type View, withFilters } from "./view";

const SORT_TABS: Record<View["sort"], { label: Key; Icon: typeof Flame }> = {
  top: { label: "themes.sort.top", Icon: Flame },
  loved: { label: "themes.sort.loved", Icon: Heart },
  worn: { label: "themes.sort.worn", Icon: Shirt },
  new: { label: "themes.sort.new", Icon: Clock },
};

/** Trending / Most loved / Most worn / New, with a pill that slides to whichever is picked. Keeps the search and filters. */
export function SortTabs({ view }: { view: View }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("themes.sort.label")} className="inline-flex w-fit max-w-full overflow-x-auto rounded-full border bg-card/80 p-1 shadow-sm backdrop-blur">
      {SORTS.map((sort) => {
        const { label, Icon } = SORT_TABS[sort];
        const active = sort === view.sort;
        return (
          <Link
            key={sort}
            to="/themes"
            search={toSearch({ ...view, sort, page: 1 })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors sm:px-4",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-primary",
            )}
          >
            {active ? (
              <motion.span
                layoutId="themes-sort-pill"
                className="absolute inset-0 -z-0 rounded-full bg-primary shadow-[0_6px_18px_-8px_var(--primary)]"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ) : null}
            <Icon className="relative hidden size-4 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110 sm:block" />
            <span className="relative">{t(label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Searches names, descriptions and makers as you type (after a short pause). It's a
 * GET form too, so Enter works before the page's JavaScript loads.
 */
export function SearchBox({ view }: { view: View }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [value, setValue] = useState(view.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The last query this box asked for, so its own navigations don't overwrite newer typing.
  const sent = useRef(view.q);

  // A query from elsewhere (the clear button, back and forward) replaces what's typed.
  useEffect(() => {
    if (view.q !== sent.current) {
      sent.current = view.q;
      setValue(view.q);
    }
  }, [view.q]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const go = (q: string, replace: boolean) => {
    clearTimeout(timer.current);
    sent.current = q.trim();
    void navigate({ to: "/themes", search: toSearch({ ...view, q: q.trim(), page: 1 }), replace });
  };

  return (
    <form
      role="search"
      action="/themes"
      method="get"
      className="relative w-full sm:w-64"
      onSubmit={(event) => {
        event.preventDefault();
        go(value, false);
      }}
    >
      {/* Without JavaScript, the form carries the rest of the view along. */}
      {Object.entries(toSearch({ ...view, q: "", page: 1 })).map(([key, v]) => (
        <input key={key} type="hidden" name={key} value={String(v)} />
      ))}
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        name="q"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          clearTimeout(timer.current);
          // Typing replaces the history entry, so Back doesn't step through every letter.
          timer.current = setTimeout(() => go(next, true), 350);
        }}
        maxLength={60}
        placeholder={t("themes.index.searchPlaceholder")}
        aria-label={t("themes.index.search")}
        className="rounded-full bg-card/80 pr-9 pl-9 backdrop-blur [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <Link
          to="/themes"
          search={toSearch({ ...view, q: "", page: 1 })}
          onClick={() => {
            clearTimeout(timer.current);
            sent.current = "";
            setValue("");
          }}
          aria-label={t("themes.index.clearSearch")}
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-primary"
        >
          <X className="size-4" />
        </Link>
      ) : null}
    </form>
  );
}

const chip = "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors";
const chipState = (active: boolean) =>
  active ? "border-primary bg-primary text-primary-foreground shadow-[0_6px_18px_-10px_var(--primary)]" : "bg-card text-muted-foreground hover:border-primary hover:text-primary";

/** A filter option: picking the one that's on turns it off again. */
function Chip({ view, set, active, label, children }: { view: View; set: Partial<ThemeFilters>; active: boolean; label?: string; children: ReactNode }) {
  const off = Object.fromEntries(Object.keys(set).map((key) => [key, undefined]));
  return (
    <Link
      to="/themes"
      search={toSearch(withFilters(view, active ? off : set))}
      aria-pressed={active}
      aria-label={label}
      className={cn(chip, chipState(active))}
    >
      {children}
    </Link>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** A tiny square with the corner style it stands for. */
const CORNER_RADIUS = { sharp: "1px", soft: "3px", round: "999px" } as const;

/** Look (light or dark), color, corners, when it was made, and (signed in) hearted by me. */
export function FilterBar({ view, signedIn }: { view: View; signedIn: boolean }) {
  const { t } = useI18n();
  const { filters } = view;
  const count = activeFilters(filters);

  return (
    <div className="rise flex flex-col gap-3 rounded-2xl border bg-card/80 p-3 backdrop-blur sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-extrabold">
          <SlidersHorizontal className="size-4 text-primary" /> {t("themes.filters.label")}
          {count ? <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground tabular-nums">{count}</span> : null}
        </p>
        {count ? (
          <Link
            to="/themes"
            search={toSearch({ ...view, page: 1, filters: {} })}
            className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary"
          >
            <X className="size-3.5" /> {t("themes.filters.clear")}
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Group label={t("themes.filters.look")}>
          <Chip view={view} set={{ mode: "light" }} active={filters.mode === "light"}>
            <Sun className="size-3.5" /> {t("themes.filters.light")}
          </Chip>
          <Chip view={view} set={{ mode: "dark" }} active={filters.mode === "dark"}>
            <Moon className="size-3.5" /> {t("themes.filters.dark")}
          </Chip>
        </Group>

        <Group label={t("themes.filters.color")}>
          {THEME_COLORS.map((color) => {
            const active = filters.color === color;
            const name = t(`themes.filters.colors.${color}`);
            return (
              <Tooltip key={color}>
                <TooltipTrigger asChild>
                  <Link
                    to="/themes"
                    search={toSearch(withFilters(view, { color: active ? undefined : color }))}
                    aria-pressed={active}
                    aria-label={name}
                    className={cn(
                      "size-6 shrink-0 rounded-full border-2 border-card shadow-sm ring-offset-2 ring-offset-card transition-transform hover:scale-115",
                      active ? "scale-110 ring-2 ring-ring" : "",
                    )}
                    style={{ background: COLOR_SWATCHES[color] }}
                  />
                </TooltipTrigger>
                <TooltipContent>{name}</TooltipContent>
              </Tooltip>
            );
          })}
        </Group>

        <Group label={t("themes.filters.corners")}>
          {THEME_CORNERS.map((corners) => (
            <Chip key={corners} view={view} set={{ corners }} active={filters.corners === corners}>
              <span aria-hidden className="size-3 border-[1.5px] border-current" style={{ borderRadius: CORNER_RADIUS[corners] }} />
              {t(`themes.filters.cornerStyles.${corners}`)}
            </Chip>
          ))}
        </Group>

        <Group label={t("themes.filters.made")}>
          {THEME_PERIODS.map((period) => (
            <Chip key={period} view={view} set={{ period }} active={filters.period === period}>
              {t(`themes.filters.periods.${period}`)}
            </Chip>
          ))}
        </Group>

        {signedIn ? (
          <Chip view={view} set={{ hearted: "1" }} active={filters.hearted === "1"}>
            <Heart className="size-3.5" fill={filters.hearted ? "currentColor" : "none"} /> {t("themes.filters.hearted")}
          </Chip>
        ) : null}
      </div>
    </div>
  );
}

/** Previous, numbered pages and Next, keeping the sort, search and filters. */
export function Pager({ view, pages }: { view: View; pages: number }) {
  const { t } = useI18n();
  const { page } = view;
  const to = (n: number) => toSearch({ ...view, page: n });
  const step = "btn group rounded-full font-bold";
  return (
    <nav aria-label={t("themes.index.pages")} className="flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm" className={step}>
          <Link to="/themes" search={to(page - 1)} rel="prev">
            <ArrowLeft className="transition-transform group-hover:-translate-x-1" /> {t("themes.index.back")}
          </Link>
        </Button>
      ) : null}
      <ol className="flex items-center gap-1">
        {pageNumbers(page, pages).map((n, i) =>
          n === "gap" ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={n}>
              <Link
                to="/themes"
                search={to(n)}
                aria-current={n === page ? "page" : undefined}
                aria-label={t("themes.index.page", { page: n })}
                className={cn(
                  "grid h-8 min-w-8 place-items-center rounded-full px-2 text-sm font-bold tabular-nums transition-colors",
                  n === page ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-primary",
                )}
              >
                {n}
              </Link>
            </li>
          ),
        )}
      </ol>
      {page < pages ? (
        <Button asChild variant="outline" size="sm" className={step}>
          <Link to="/themes" search={to(page + 1)} rel="next">
            {t("themes.index.more")} <ArrowRight className="transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
