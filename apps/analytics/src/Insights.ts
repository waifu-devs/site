/**
 * The stats page's history: how the anonymous signals and health reports moved
 * day by day. Everything is a sum over many installs or reports; nothing here
 * goes below a day, a version or an app.
 */
import { Effect, Schema } from "effect";
import { Insights } from "./Api.ts";
import { Lake } from "./Lake.ts";
import { percentile, reportSummary } from "./ReportSummary.ts";
import { summary } from "./Summary.ts";

/** Timed things and features followed day by day: the busiest ones. */
const TOP_METRICS = 8;
const TOP_FEATURES = 12;

export const insights = (days: number) =>
  Effect.gen(function* () {
    const lake = yield* Lake;
    const where = `sent_at > now() - to_days(CAST($1 AS INTEGER))`;
    const params = [days];
    const day = `CAST(CAST(sent_at AS DATE) AS VARCHAR) AS day`;

    const reports = yield* lake.query(
      `SELECT ${day}, source, count(*)::DOUBLE AS reports,
         count(DISTINCT coalesce(install_id, source || ':' || part))::DOUBLE AS senders, sum(dropped)::DOUBLE AS dropped
       FROM lake.reports.reports_unique WHERE ${where} GROUP BY ALL ORDER BY day`,
      params,
    );
    const errors = yield* lake.query(
      `SELECT ${day}, source, app, sum(count)::DOUBLE AS count, count(DISTINCT kind || place)::DOUBLE AS kinds
       FROM lake.reports.errors_unique WHERE ${where} GROUP BY ALL ORDER BY day`,
      params,
    );
    const top = `WITH top AS (
         SELECT source, app, metric FROM lake.reports.timings_unique WHERE ${where}
         GROUP BY ALL ORDER BY sum(count) DESC LIMIT ${TOP_METRICS}
       )`;
    const totals = yield* lake.query(
      `${top}
       SELECT ${day}, t.source, t.app, t.metric, CAST(bounds_ms AS VARCHAR) AS bounds, sum(count)::DOUBLE AS count, sum(sum_ms)::DOUBLE AS sum_ms
       FROM lake.reports.timings_unique t JOIN top USING (source, app, metric) WHERE ${where} GROUP BY ALL`,
      params,
    );
    const buckets = yield* lake.query(
      `${top}
       SELECT day, source, app, metric, bounds, i::INTEGER AS i, sum(n)::DOUBLE AS n
       FROM (
         SELECT ${day}, t.source, t.app, t.metric, CAST(bounds_ms AS VARCHAR) AS bounds,
           unnest(buckets) AS n, generate_subscripts(buckets, 1) AS i
         FROM lake.reports.timings_unique t JOIN top USING (source, app, metric) WHERE ${where}
       )
       GROUP BY ALL`,
      params,
    );
    const features = yield* lake.query(
      `WITH top AS (
         SELECT source, app, feature FROM lake.reports.usage_unique WHERE ${where}
         GROUP BY ALL ORDER BY sum(count) DESC LIMIT ${TOP_FEATURES}
       )
       SELECT ${day}, u.source, u.app, u.feature, sum(count)::DOUBLE AS count
       FROM lake.reports.usage_unique u JOIN top USING (source, app, feature)
       WHERE ${where} GROUP BY ALL ORDER BY day`,
      params,
    );

    const recent = `sent_at > now() - INTERVAL 7 DAYS`;
    const versions = yield* lake.query(
      `SELECT source, app, version, count(DISTINCT coalesce(install_id, source || ':' || part))::DOUBLE AS installs
       FROM (
         ${["errors", "timings", "usage"].map((table) => `SELECT source, app, version, install_id, part FROM lake.reports.${table}_unique WHERE ${recent}`).join(" UNION ALL ")}
       )
       GROUP BY ALL ORDER BY installs DESC, version DESC`,
    );

    // Each timed thing's day: its bucket counts summed, then its percentiles.
    const keyOf = (row: Record<string, unknown>) => `${row.day}\n${row.source}\n${row.app}\n${row.metric}\n${row.bounds}`;
    const summed = new Map<string, number[]>();
    for (const row of buckets) {
      const list = summed.get(keyOf(row)) ?? [];
      list[Number(row.i) - 1] = Number(row.n);
      summed.set(keyOf(row), list);
    }
    const timings = totals
      .map((row) => {
        const bounds = JSON.parse(String(row.bounds)) as number[];
        const counts = Array.from(summed.get(keyOf(row)) ?? [], (n) => n ?? 0);
        const count = Number(row.count);
        return {
          day: String(row.day),
          source: String(row.source),
          app: String(row.app),
          metric: String(row.metric),
          count,
          avg_ms: count > 0 ? Math.round(Number(row.sum_ms) / count) : 0,
          p50_ms: percentile(bounds, counts, count, 0.5),
          p95_ms: percentile(bounds, counts, count, 0.95),
        };
      })
      .sort((a, b) => a.day.localeCompare(b.day));

    const usage = yield* summary(days);
    const problems = yield* reportSummary(days, undefined);
    return yield* Schema.decodeUnknown(Insights)({ days, usage, problems, reports, errors, timings, features, versions });
  });
