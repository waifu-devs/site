/**
 * What the marketplace is showing (sort, search, filters, page) and how it maps to the
 * URL: defaults stay out of it, so `/themes` is the plain trending first page.
 */
import { THEME_MAX_PAGE, THEME_QUERY_MAX, type ThemeFilters, type ThemeSort } from "@waifu-devs/domain/api";
import { THEME_COLORS, THEME_CORNERS, THEME_MODES, THEME_PERIODS } from "@waifu-devs/domain/themes";

export const SORTS = ["top", "loved", "worn", "new"] as const satisfies readonly ThemeSort[];

export type View = { sort: ThemeSort; q: string; page: number; filters: ThemeFilters };

/** The URL's search params; every one is optional. */
export type MarketSearch = {
  sort?: Exclude<ThemeSort, "top">;
  q?: string;
  page?: number;
} & ThemeFilters;

const pick = <T extends string>(options: readonly T[], value: unknown): T | undefined => options.find((option) => option === value);

/** The view a URL asks for, ignoring anything it doesn't understand. */
export function parseSearch(search: Record<string, unknown>): View {
  const page = Number(search.page);
  return {
    sort: pick(SORTS, search.sort) ?? "top",
    q: typeof search.q === "string" ? search.q.trim().slice(0, THEME_QUERY_MAX) : "",
    page: Number.isInteger(page) && page >= 1 && page <= THEME_MAX_PAGE ? page : 1,
    filters: {
      mode: pick(THEME_MODES, search.mode),
      color: pick(THEME_COLORS, search.color),
      corners: pick(THEME_CORNERS, search.corners),
      period: pick(THEME_PERIODS, search.period),
      // A bare `?hearted` comes back from the router as true, a typed-in one as 1 or "1".
      hearted: search.hearted === "1" || search.hearted === 1 || search.hearted === true ? "1" : undefined,
    },
  };
}

/** The search params for a view, leaving out the defaults. */
export function toSearch(view: View): MarketSearch {
  const search: MarketSearch = {};
  if (view.sort !== "top") search.sort = view.sort;
  if (view.q) search.q = view.q;
  if (view.page > 1) search.page = view.page;
  for (const [key, value] of Object.entries(view.filters)) if (value !== undefined) Object.assign(search, { [key]: value });
  return search;
}

/** The view with some filters changed, back on the first page (the old page may not exist anymore). */
export const withFilters = (view: View, filters: Partial<ThemeFilters>): View => ({ ...view, page: 1, filters: { ...view.filters, ...filters } });

export const activeFilters = (filters: ThemeFilters) => Object.values(filters).filter((value) => value !== undefined).length;

/**
 * Which page numbers to show: the first, the last, and two either side of this one,
 * with gaps between. A gap that would hide a single page shows that page instead.
 */
export function pageNumbers(page: number, pages: number): Array<number | "gap"> {
  const shown = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return shown.flatMap((n, i) => {
    const skipped = i > 0 ? n - shown[i - 1] - 1 : 0;
    return skipped === 0 ? [n] : skipped === 1 ? [n - 1, n] : (["gap", n] as const);
  });
}
