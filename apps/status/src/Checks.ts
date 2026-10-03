/**
 * The checks. Every minute this service asks each part of fuwa.chat and
 * of this site whether it's up, over the same public addresses apps and
 * browsers use, and keeps one row per part per UTC day (schema.ts). Only the
 * hosts below are ever called, and redirects are never followed; nothing a
 * visitor sends changes where a check goes.
 *
 * fuwa.chat answers two things: /healthz from whichever gateway takes the call
 * (up once it hears from the directory), and /healthz/parts, the parts behind
 * the gateways (the directory, each shard and the calls part) as the directory
 * sees them. A fuwa without /healthz/parts (before it shipped, or a single
 * process) only shows its gateways.
 */
import { SqlClient } from "@effect/sql";
import type { StatusComponent, StatusIncident, StatusReport, StatusState } from "./Report.ts";
import { Config, Duration, Effect, Schedule } from "effect";

/** How often every part is checked. */
export const EVERY_SECONDS = 60;
/** Days the page shows, today included, and how long day rows are kept. */
export const WINDOW_DAYS = 90;
const KEEP_DAYS = 400;
/** A check taking longer than this fails. */
const TIMEOUT_MS = 10_000;
/** Answering slower than this counts as up, but slow. */
const SLOW_MS = 2_000;
/** Failed checks in a row that make an incident. */
const FAILURES_FOR_INCIDENT = 2;
/** How long an answer to GET /status is reused. */
const CACHE_MS = 20_000;
/** Incidents the page lists. */
const INCIDENTS = 30;

type Group = "fuwa" | "site";
type Check = { component: string; ok: boolean; latencyMs: number | null; reason: string };

/** What each part is called on the page. Shards are named from their id. */
const KNOWN: Record<string, { group: Group; name: string; description: string; order: number }> = {
  "fuwa.gateways": { group: "fuwa", name: "Gateways", description: "Where the apps connect to fuwa.chat", order: 0 },
  "fuwa.server": { group: "fuwa", name: "fuwa.chat", description: "Everything, in one process", order: 1 },
  "fuwa.directory": { group: "fuwa", name: "Accounts and messages", description: "Sign-in, accounts, direct messages and settings", order: 2 },
  "fuwa.media": { group: "fuwa", name: "Calls", description: "Voice and video in calls", order: 4 },
  "site.web": { group: "site", name: "www.waifu.dev", description: "The community site", order: 10 },
  "site.api": { group: "site", name: "Sign-in and profiles", description: "api.waifu.dev: signing in, profiles, themes and news", order: 11 },
  "site.analytics": { group: "site", name: "Anonymous reports", description: "analytics.waifu.dev: usage signals and bug reports", order: 12 },
};

const SHARD = /^fuwa\.shard\.([a-z0-9-]{1,64})$/;

export const describe = (component: string) => {
  const known = KNOWN[component];
  if (known) return known;
  const shard = SHARD.exec(component)?.[1];
  if (shard) {
    const number = /^shard-(\d+)$/.exec(shard)?.[1];
    return {
      group: "fuwa" as const,
      name: number ? `Communities, shard ${number}` : `Communities (${shard})`,
      description: "Servers, channels and their messages",
      order: 3,
    };
  }
  return null;
};

/** The few words an incident keeps about a failed check. */
const reasonOf = (error: unknown) =>
  error instanceof DOMException && error.name === "TimeoutError" ? "timed out" : "couldn't connect";

/** The most of an answer a check reads; /healthz/parts is a few hundred bytes. */
const MAX_BODY_BYTES = 64 * 1024;

/** Reads up to `max` bytes of a body, then stops reading it. */
async function readCapped(response: Response, max: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(all.subarray(0, max));
}

/** One GET, timed. Never follows a redirect. */
const get = (url: string) =>
  Effect.promise(async () => {
    const started = performance.now();
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "status.waifu.dev" } });
      const body = await readCapped(response, MAX_BODY_BYTES);
      return { status: response.status, body, latencyMs: Math.round(performance.now() - started), error: null };
    } catch (error) {
      return { status: 0, body: "", latencyMs: null, error: reasonOf(error) };
    }
  });

const simple = (component: string, url: string) =>
  get(url).pipe(
    Effect.map(({ status, latencyMs, error }): Check => {
      const ok = status >= 200 && status < 300;
      return { component, ok, latencyMs: ok ? latencyMs : null, reason: error ?? `HTTP ${status}` };
    }),
  );

/** What fuwa's /healthz/parts answers (see the fuwa repo, server/src/cluster/status.rs). */
type Parts = { parts: Array<{ part: string; id?: string; up: boolean }> };

const isParts = (value: unknown): value is Parts =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as Parts).parts) &&
  (value as Parts).parts.every((p) => typeof p?.part === "string" && typeof p.up === "boolean" && (p.id === undefined || typeof p.id === "string"));

/** The gateways, and whatever parts fuwa.chat says it has behind them. */
const fuwa = (base: string) =>
  Effect.gen(function* () {
    const [gateways, parts] = yield* Effect.all([simple("fuwa.gateways", `${base}/healthz`), get(`${base}/healthz/parts`)], {
      concurrency: 2,
    });
    const checks: Check[] = [gateways];
    let listed: Parts | null = null;
    try {
      const value: unknown = parts.status === 200 ? JSON.parse(parts.body) : null;
      if (isParts(value)) listed = value;
    } catch {
      // A fuwa from before /healthz/parts answers it with the web app.
    }
    for (const part of listed?.parts.slice(0, 32) ?? []) {
      const component =
        part.part === "shard" && part.id && /^[a-z0-9-]{1,64}$/.test(part.id)
          ? `fuwa.shard.${part.id}`
          : ["directory", "media", "server"].includes(part.part)
            ? `fuwa.${part.part}`
            : null;
      // The parts answer the directory, not us: no time of their own to show.
      if (component) checks.push({ component, ok: part.up, latencyMs: null, reason: part.up ? "" : "not answering the directory" });
    }
    return { checks, partsListed: listed !== null };
  });

export class Checks extends Effect.Service<Checks>()("Checks", {
  scoped: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const fuwaUrl = (yield* Config.string("STATUS_FUWA_URL").pipe(Config.withDefault("https://fuwa.chat"))).replace(/\/$/, "");
    const webUrl = (yield* Config.string("STATUS_WEB_URL").pipe(Config.withDefault("https://www.waifu.dev"))).replace(/\/$/, "");
    const apiUrl = (yield* Config.string("STATUS_API_URL").pipe(Config.withDefault("https://api.waifu.dev"))).replace(/\/$/, "");
    const analyticsUrl = (yield* Config.string("STATUS_ANALYTICS_URL").pipe(Config.withDefault("https://analytics.waifu.dev"))).replace(/\/$/, "");
    const enabled = yield* Config.boolean("STATUS_CHECKS").pipe(Config.withDefault(true));

    /** Failed checks in a row, per part, as this replica saw them. */
    const failures = new Map<string, number>();

    const record = (checks: ReadonlyArray<Check>, now: Date) =>
      Effect.forEach(
        checks,
        (check) =>
          Effect.gen(function* () {
            const slow = check.ok && check.latencyMs !== null && check.latencyMs > SLOW_MS;
            const state = !check.ok ? "down" : slow ? "slow" : "up";
            const day = now.toISOString().slice(0, 10);
            yield* sql`
              INSERT INTO status_days (component, day, checks, up, slow, latency_ms_sum)
              VALUES (${check.component}, ${day}, 1, ${check.ok ? 1 : 0}, ${slow ? 1 : 0}, ${check.latencyMs ?? 0})
              ON CONFLICT (component, day) DO UPDATE SET
                checks = status_days.checks + 1,
                up = status_days.up + EXCLUDED.up,
                slow = status_days.slow + EXCLUDED.slow,
                latency_ms_sum = status_days.latency_ms_sum + EXCLUDED.latency_ms_sum`;
            yield* sql`
              INSERT INTO status_components (component, state, latency_ms, checked_at, since)
              VALUES (${check.component}, ${state}, ${check.latencyMs}, ${now}, ${now})
              ON CONFLICT (component) DO UPDATE SET
                since = CASE WHEN status_components.state = EXCLUDED.state THEN status_components.since ELSE EXCLUDED.since END,
                state = EXCLUDED.state,
                latency_ms = EXCLUDED.latency_ms,
                checked_at = EXCLUDED.checked_at`;

            const failed = check.ok ? 0 : (failures.get(check.component) ?? 0) + 1;
            failures.set(check.component, failed);
            if (failed === FAILURES_FOR_INCIDENT) {
              // The first failure is when it started.
              const started = new Date(now.getTime() - (FAILURES_FOR_INCIDENT - 1) * EVERY_SECONDS * 1000);
              yield* sql`
                INSERT INTO status_incidents (component, reason, started_at) VALUES (${check.component}, ${check.reason}, ${started})
                ON CONFLICT (component) WHERE ended_at IS NULL DO NOTHING`;
            }
            if (check.ok) yield* sql`UPDATE status_incidents SET ended_at = ${now} WHERE component = ${check.component} AND ended_at IS NULL`;
          }),
        { discard: true },
      );

    const round = Effect.gen(function* () {
      const now = new Date();
      const [fuwaChecks, site] = yield* Effect.all(
        [
          fuwa(fuwaUrl),
          Effect.all(
            [simple("site.web", `${webUrl}/api/health`), simple("site.api", `${apiUrl}/health`), simple("site.analytics", `${analyticsUrl}/health`)],
            { concurrency: 3 },
          ),
        ],
        { concurrency: 2 },
      );
      yield* record([...fuwaChecks.checks, ...site], now);
      // A shard that's gone from the list (or a single process that split) stops being shown,
      // and any incident it had ends.
      if (fuwaChecks.partsListed) {
        const listed = fuwaChecks.checks.map((c) => c.component);
        yield* sql`DELETE FROM status_components WHERE component LIKE 'fuwa.%' AND component <> 'fuwa.gateways' AND NOT (component IN ${sql.in(listed)})`;
        yield* sql`UPDATE status_incidents SET ended_at = ${now} WHERE ended_at IS NULL AND component LIKE 'fuwa.%' AND NOT (component IN ${sql.in(listed)})`;
      }
    });

    const prune = sql`DELETE FROM status_days WHERE day < current_date - ${KEEP_DAYS}::int`;

    if (enabled) {
      yield* round.pipe(
        // No cause: database errors name internal hosts and addresses, and the logs are public.
        Effect.catchAllCause(() => Effect.logWarning("Status checks failed to save")),
        Effect.repeat(Schedule.spaced(Duration.seconds(EVERY_SECONDS))),
        Effect.forkScoped,
      );
      yield* prune.pipe(
        Effect.catchAllCause(() => Effect.void),
        Effect.repeat(Schedule.spaced(Duration.hours(24))),
        Effect.forkScoped,
      );
    }

    const iso = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string).toISOString());

    const build = Effect.gen(function* () {
      const now = new Date();
      const latest = yield* sql<{ component: string; state: string; latencyMs: number | null; checkedAt: Date; since: Date }>`
        SELECT component, state, latency_ms AS "latencyMs", checked_at AS "checkedAt", since FROM status_components`;
      const days = yield* sql<{ component: string; day: string; checks: number; up: number; slow: number; latencyMsSum: string }>`
        SELECT component, to_char(day, 'YYYY-MM-DD') AS day, checks, up, slow, latency_ms_sum AS "latencyMsSum" FROM status_days
        WHERE day > current_date - ${WINDOW_DAYS}::int ORDER BY day`;
      const incidents = yield* sql<{ id: string; component: string; reason: string; startedAt: Date; endedAt: Date | null }>`
        SELECT id, component, reason, started_at AS "startedAt", ended_at AS "endedAt" FROM status_incidents
        ORDER BY (ended_at IS NULL) DESC, started_at DESC LIMIT ${INCIDENTS}`;

      const stale = now.getTime() - 5 * EVERY_SECONDS * 1000;
      const components: Array<StatusComponent & { order: number }> = [];
      for (const row of latest) {
        const about = describe(row.component);
        if (!about) continue;
        const mine = days.filter((d) => d.component === row.component);
        const checks = mine.reduce((n, d) => n + d.checks, 0);
        const up = mine.reduce((n, d) => n + d.up, 0);
        const checkedAt = new Date(row.checkedAt);
        components.push({
          id: row.component,
          group: about.group,
          name: about.name,
          description: about.description,
          order: about.order,
          state: checkedAt.getTime() < stale ? "unknown" : (row.state as StatusState),
          latencyMs: row.latencyMs,
          checkedAt: checkedAt.toISOString(),
          since: iso(row.since),
          uptime: checks > 0 ? up / checks : null,
          days: mine.map((d) => ({
            day: d.day,
            checks: d.checks,
            up: d.up,
            slow: d.slow,
            avgMs: d.up > 0 && Number(d.latencyMsSum) > 0 ? Math.round(Number(d.latencyMsSum) / d.up) : null,
          })),
        });
      }
      components.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, "en", { numeric: true }));

      const listed: StatusIncident[] = incidents.map((i) => ({
        id: i.id,
        component: i.component,
        name: describe(i.component)?.name ?? i.component,
        reason: i.reason,
        startedAt: new Date(i.startedAt).toISOString(),
        endedAt: iso(i.endedAt),
      }));
      return {
        at: now.toISOString(),
        window: WINDOW_DAYS,
        everySeconds: EVERY_SECONDS,
        components: components.map(({ order: _, ...c }) => c),
        incidents: listed,
      } satisfies StatusReport;
    });

    // Anyone can ask, so answers are reused for a few seconds rather than read every time.
    let cached: { at: number; report: StatusReport } | null = null;
    const lock = yield* Effect.makeSemaphore(1);
    const report = lock.withPermits(1)(
      Effect.gen(function* () {
        if (cached && Date.now() - cached.at < CACHE_MS) return cached.report;
        const fresh = yield* build;
        cached = { at: Date.now(), report: fresh };
        return fresh;
      }),
    );

    return { report, round } as const;
  }),
}) {}
