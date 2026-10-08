/**
 * The stats page's read. It comes from the analytics service, which the web server asks over
 * Railway's private network (ANALYTICS_INTERNAL_URL), so no token or address
 * ever reaches a browser and the browser never talks to analytics.
 */
import { createServerFn } from "@tanstack/react-start";
import { Effect, Option } from "effect";
import { type Insights, RANGES, type Range } from "@/lib/stats";
import { serverError, serverTiming } from "./reports.ts";
import { run } from "./runtime.ts";

/** How long a range's history is reused. The year's queries are the heaviest, and the data changes daily. */
const FRESH_MS = 5 * 60_000;
/** The latest history per range, shared by every visitor; one fetch at a time per range. */
const cache = new Map<Range, { at: number; insights: Promise<Insights> }>();

function history(base: string, days: Range): Promise<Insights> {
  const held = cache.get(days);
  if (held && Date.now() - held.at < FRESH_MS) return held.insights;
  const insights = (async () => {
    const response = await fetch(new URL(`/v1/insights?days=${days}`, base), { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`analytics answered ${response.status}`);
    return (await response.json()) as Insights;
  })();
  cache.set(days, { at: Date.now(), insights });
  // A failure isn't kept: the next visit asks again.
  insights.catch(() => cache.get(days)?.insights === insights && cache.delete(days));
  return insights;
}

/** The stats page's history over `days`; null data when analytics can't be reached. */
export const getStats = createServerFn({ method: "GET" })
  .validator((days: unknown): Range => (RANGES.includes(days as Range) ? (days as Range) : 90))
  .handler(({ data: days }) =>
    run(
      Effect.gen(function* () {
        const base = process.env.ANALYTICS_INTERNAL_URL;
        const today = new Date().toISOString().slice(0, 10);
        if (!base) return { days, today, insights: null };
        const started = performance.now();
        const insights = yield* Effect.tryPromise(() => history(base, days)).pipe(
          Effect.tapError(() => Effect.sync(() => serverError("stats_unavailable", "/stats"))),
          Effect.option,
        );
        serverTiming("load:/stats", performance.now() - started);
        return { days, today, insights: Option.getOrNull(insights) };
      }),
    ),
  );
