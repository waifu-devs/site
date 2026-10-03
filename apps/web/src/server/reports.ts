/**
 * Visitors' anonymous bug reports (lib/reports.ts sends them to /api/reports),
 * added together here and passed to the analytics service every few minutes
 * over Railway's private network (ANALYTICS_INTERNAL_URL), as one
 * `site.report.v1`. Nothing about who sent a report is kept or passed on: not
 * their address, not their account, not even that they sent one. Without
 * ANALYTICS_INTERNAL_URL (local development) reports are checked and dropped.
 */

/** The browsers' timing buckets (lib/reports.ts). */
const BOUNDS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000];
const BUCKETS = BOUNDS_MS.length + 1;
/** Entries of each kind one browser's report may carry, and that one sent report holds. */
const MAX_REPORT_ENTRIES = 64;
const MAX_ENTRIES = 512;
/** One browser's report counts at most this much of any one thing. */
const MAX_COUNT = 10_000;
/** Reports taken a minute, from everyone together: past it they're dropped (never counted per visitor). */
const MAX_PER_MINUTE = 1200;
export const MAX_REPORT_BYTES = 16 * 1024;
const EVERY_MS = Number(process.env.BUG_REPORTS_INTERVAL_MS) || 10 * 60 * 1000;

const LABEL = /^[A-Za-z0-9_.:/#@-]+$/;
const label = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= max && LABEL.test(value) ? value : null;
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? Math.min(value, MAX_COUNT) : null;

type Origin = { app: string; version: string; platform: string; os: string };
type Timing = { buckets: number[]; sum_ms: number };

let since = Date.now();
let dropped = 0;
let errors = new Map<string, number>();
let timings = new Map<string, Timing>();
let usage = new Map<string, number>();
let minute = { started: 0, taken: 0 };

const keyOf = (origin: Origin, ...rest: string[]) => [origin.app, origin.version, origin.platform, origin.os, ...rest].join("\n");

function bump(map: Map<string, number>, key: string, by: number) {
  const now = map.get(key);
  if (now !== undefined) map.set(key, now + by);
  else if (map.size < MAX_ENTRIES) map.set(key, by);
  else dropped++;
}

/** Why a report was turned away, or null once it's counted. */
export function addReport(body: unknown): string | null {
  if (!body || typeof body !== "object") return "not a report";
  const report = body as Record<string, unknown>;
  const origin = {
    app: report.app === "web" ? "web" : null,
    version: label(report.version, 32),
    platform: label(report.platform, 16),
    os: label(report.os, 16),
  };
  if (!origin.app || !origin.version || !origin.platform || !origin.os) return "app, version, platform and os are required";
  const list = (value: unknown) => (Array.isArray(value) && value.length <= MAX_REPORT_ENTRIES ? (value as Record<string, unknown>[]) : null);
  const errorList = list(report.errors ?? []);
  const timingList = list(report.timings ?? []);
  const usageList = list(report.usage ?? []);
  if (!errorList || !timingList || !usageList) return `at most ${MAX_REPORT_ENTRIES} entries of each kind`;

  const checkedErrors = errorList.map((e) => ({ kind: label(e?.kind, 48), place: label(e?.place, 120), count: count(e?.count) }));
  const checkedTimings = timingList.map((t) => ({
    metric: label(t?.metric, 96),
    buckets: Array.isArray(t?.buckets) && t.buckets.length === BUCKETS ? t.buckets.map(count) : null,
    sum_ms: count(t?.sum_ms) ?? 0,
  }));
  const checkedUsage = usageList.map((u) => ({ feature: label(u?.feature, 96), count: count(u?.count) }));
  if (checkedErrors.some((e) => !e.kind || !e.place || e.count === null)) return "a bad error entry";
  if (checkedTimings.some((t) => !t.metric || !t.buckets || t.buckets.some((n) => n === null))) return "a bad timing entry";
  if (checkedUsage.some((u) => !u.feature || u.count === null)) return "a bad usage entry";

  // Everyone's reports share one allowance a minute, so a flood can't grow the totals without end.
  const now = Date.now();
  if (now - minute.started > 60_000) minute = { started: now, taken: 0 };
  if (++minute.taken > MAX_PER_MINUTE) return null;

  const from = origin as Origin;
  for (const e of checkedErrors) if (e.count) bump(errors, keyOf(from, e.kind!, e.place!), e.count);
  for (const u of checkedUsage) if (u.count) bump(usage, keyOf(from, u.feature!), u.count);
  for (const t of checkedTimings) {
    const buckets = t.buckets as number[];
    const n = buckets.reduce((a, b) => a + b, 0);
    if (n === 0) continue;
    const key = keyOf(from, t.metric!);
    const total = timings.get(key);
    // No more than 30 seconds per duration on average, so one browser can't skew the sums.
    const sum = Math.min(t.sum_ms, n * BOUNDS_MS[BOUNDS_MS.length - 1]!);
    if (total) {
      total.buckets = total.buckets.map((m, i) => m + buckets[i]!);
      total.sum_ms += sum;
    } else if (timings.size < MAX_ENTRIES) timings.set(key, { buckets: [...buckets], sum_ms: sum });
    else dropped++;
  }
  scheduleSending();
  return null;
}

/** A ULID: the time, then randomness, in Crockford's base32. */
function ulid(now = Date.now()): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let time = "";
  for (let n = now, i = 0; i < 10; i++, n = Math.floor(n / 32)) time = alphabet[n % 32] + time;
  const random = crypto.getRandomValues(new Uint8Array(16));
  return time + Array.from(random, (byte) => alphabet[byte % 32]).join("");
}

const origin = (key: string) => {
  const [app, version, platform, os, ...rest] = key.split("\n");
  return { origin: { app: app!, version: version!, platform: platform!, os: os! }, rest };
};

/** Takes everything added so far as a `site.report.v1`, or null when there's nothing. */
export function takeReport(now = Date.now()) {
  if (errors.size === 0 && timings.size === 0 && usage.size === 0 && dropped === 0) return null;
  const report = {
    schema: "site.report.v1",
    report_id: ulid(now),
    hosting: "hosted",
    part: "web",
    since,
    sent_at: now,
    bounds_ms: BOUNDS_MS,
    errors: [...errors].map(([key, n]) => {
      const { origin: o, rest } = origin(key);
      return { ...o, kind: rest[0]!, place: rest[1]!, count: n };
    }),
    timings: [...timings].map(([key, t]) => {
      const { origin: o, rest } = origin(key);
      return { ...o, metric: rest[0]!, buckets: t.buckets, count: t.buckets.reduce((a, b) => a + b, 0), sum_ms: t.sum_ms };
    }),
    usage: [...usage].map(([key, n]) => {
      const { origin: o, rest } = origin(key);
      return { ...o, feature: rest[0]!, count: n };
    }),
    dropped,
  };
  since = now;
  dropped = 0;
  errors = new Map();
  timings = new Map();
  usage = new Map();
  return report;
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Starts passing totals on once the first report arrives. */
function scheduleSending() {
  if (timer) return;
  timer = setInterval(() => void sendReport(), EVERY_MS);
  timer.unref?.();
}

/** Passes the totals to the analytics service. A report it doesn't take is dropped. */
export async function sendReport() {
  const report = takeReport();
  const base = process.env.ANALYTICS_INTERNAL_URL;
  if (!report || !base) return;
  try {
    const response = await fetch(new URL("/v1/site/reports", base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) console.warn(`analytics answered ${response.status} to a bug report; dropped it`);
  } catch {
    console.warn("couldn't reach analytics with a bug report; dropped it");
  }
}
