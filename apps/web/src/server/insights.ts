/**
 * The status and stats pages' reads. Status comes from the api's own health
 * checks; stats from the analytics service, which the web server asks over
 * Railway's private network (ANALYTICS_INTERNAL_URL), so no token or address
 * ever reaches a browser and the browser never talks to analytics.
 */
import { notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect, Option } from "effect";
import { type Insights, RANGES, type Range, STATS_ADMINS, STATS_PUBLIC } from "@/lib/stats";
import { ApiClient } from "./Api.ts";
import { serverError, serverTiming } from "./reports.ts";
import { run } from "./runtime.ts";
import { Session } from "./Session.ts";

/** How fuwa.chat and this site are doing; null when the api can't say. */
export const getStatus = createServerFn({ method: "GET" }).handler(() =>
  run(
    Effect.gen(function* () {
      const started = performance.now();
      const api = yield* ApiClient;
      const report = yield* api.anonymous.status.get().pipe(
        Effect.tapError(() => Effect.sync(() => serverError("status_unavailable", "/status"))),
        Effect.option,
      );
      serverTiming("load:/status", performance.now() - started);
      return Option.getOrNull(report);
    }),
  ),
);

/** Who may see the stats: everyone once STATS_PUBLIC is on, until then only STATS_ADMINS. */
const mayRead = Effect.gen(function* () {
  if (STATS_PUBLIC) return true;
  const user = yield* (yield* Session).currentUser;
  if (Option.isNone(user)) return yield* Effect.die(redirect({ to: "/login", search: { next: "/stats" } }));
  return user.value.githubId !== null && STATS_ADMINS.includes(user.value.githubId);
});

/** The stats page's history over `days`; null data when analytics can't be reached. */
export const getStats = createServerFn({ method: "GET" })
  .validator((days: unknown): Range => (RANGES.includes(days as Range) ? (days as Range) : 90))
  .handler(({ data: days }) =>
    run(
      Effect.gen(function* () {
        // Anyone else sees the same page as for an address that doesn't exist.
        if (!(yield* mayRead)) return yield* Effect.die(notFound());
        const base = process.env.ANALYTICS_INTERNAL_URL;
        const today = new Date().toISOString().slice(0, 10);
        if (!base) return { days, today, insights: null };
        const started = performance.now();
        const insights = yield* Effect.tryPromise(async () => {
          const response = await fetch(new URL(`/v1/insights?days=${days}`, base), { signal: AbortSignal.timeout(20_000) });
          if (!response.ok) throw new Error(`analytics answered ${response.status}`);
          return (await response.json()) as Insights;
        }).pipe(
          Effect.tapError(() => Effect.sync(() => serverError("stats_unavailable", "/stats"))),
          Effect.option,
        );
        serverTiming("load:/stats", performance.now() - started);
        return { days, today, insights: Option.getOrNull(insights) };
      }),
    ),
  );
