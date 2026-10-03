import { Effect, Schema } from "effect";
import { ReportSummary } from "./Api.ts";
import { Lake } from "./Lake.ts";

/** The upper bound of the bucket where the `q` share of `count` is reached; past the last bound, the last bound. */
export const percentile = (bounds: ReadonlyArray<number>, buckets: ReadonlyArray<number>, count: number, q: number) => {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < buckets.length; i++) {
    seen += buckets[i] ?? 0;
    if (seen >= q * count) return bounds[Math.min(i, bounds.length - 1)] ?? 0;
  }
  return bounds[bounds.length - 1] ?? 0;
};

const LIMIT = 200;

/** Recent bugs, slow paths and feature use from the health reports. */
export const reportSummary = (days: number, source: string | undefined) =>
  Effect.gen(function* () {
    const lake = yield* Lake;
    const where = `sent_at > now() - to_days(CAST($1 AS INTEGER)) AND ($2 = '' OR source = $2)`;
    const params = [days, source ?? ""];
    const errors = yield* lake.query(
      `SELECT source, app, version, kind, place, sum(count)::DOUBLE AS count,
         count(DISTINCT coalesce(install_id, source || ':' || part))::DOUBLE AS installs,
         list_sort(list(DISTINCT platform)) AS platforms, list_sort(list(DISTINCT os)) AS oses,
         strftime(min(sent_at), '%Y-%m-%dT%H:%M:%SZ') AS first_seen, strftime(max(sent_at), '%Y-%m-%dT%H:%M:%SZ') AS last_seen
       FROM lake.reports.errors_unique WHERE ${where}
       GROUP BY ALL ORDER BY count DESC, last_seen DESC LIMIT ${LIMIT}`,
      params,
    );
    const totals = yield* lake.query(
      `SELECT source, app, metric, CAST(bounds_ms AS VARCHAR) AS bounds, sum(count)::DOUBLE AS count, sum(sum_ms)::DOUBLE AS sum_ms
       FROM lake.reports.timings_unique WHERE ${where} GROUP BY ALL`,
      params,
    );
    const buckets = yield* lake.query(
      `SELECT source, app, metric, bounds, i::INTEGER AS i, sum(n)::DOUBLE AS n
       FROM (SELECT source, app, metric, CAST(bounds_ms AS VARCHAR) AS bounds, unnest(buckets) AS n, generate_subscripts(buckets, 1) AS i
             FROM lake.reports.timings_unique WHERE ${where})
       GROUP BY ALL`,
      params,
    );
    const usage = yield* lake.query(
      `SELECT source, app, feature, sum(count)::DOUBLE AS count FROM lake.reports.usage_unique WHERE ${where}
       GROUP BY ALL ORDER BY count DESC LIMIT ${LIMIT}`,
      params,
    );

    // Buckets summed per timed thing (and bucket bounds, should a sender change them).
    const keyOf = (row: Record<string, unknown>) => `${row.source}\n${row.app}\n${row.metric}\n${row.bounds}`;
    const summed = new Map<string, number[]>();
    for (const row of buckets) {
      const list = summed.get(keyOf(row)) ?? [];
      list[Number(row.i) - 1] = Number(row.n);
      summed.set(keyOf(row), list);
    }
    const slow = totals
      .map((row) => {
        const bounds = JSON.parse(String(row.bounds)) as number[];
        const counts = Array.from(summed.get(keyOf(row)) ?? [], (n) => n ?? 0);
        const count = Number(row.count);
        const firstOverSecond = bounds.findIndex((bound) => bound > 1000);
        return {
          source: String(row.source),
          app: String(row.app),
          metric: String(row.metric),
          count,
          avg_ms: count > 0 ? Math.round(Number(row.sum_ms) / count) : 0,
          p50_ms: percentile(bounds, counts, count, 0.5),
          p95_ms: percentile(bounds, counts, count, 0.95),
          p99_ms: percentile(bounds, counts, count, 0.99),
          over_1s: firstOverSecond === -1 ? 0 : counts.slice(firstOverSecond).reduce((a, b) => a + b, 0),
        };
      })
      .sort((a, b) => b.p95_ms - a.p95_ms || b.count - a.count)
      .slice(0, LIMIT);

    return yield* Schema.decodeUnknown(ReportSummary)({ days, errors, slow, usage });
  });
