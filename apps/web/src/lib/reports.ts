/**
 * Anonymous bug reports from this site, in the browser: what went wrong and
 * what was slow, as counts. Errors are counted by kind and page (its route
 * pattern, never its address), durations go into fixed buckets, and page views
 * count by route. Never anything typed, names, ids, links or addresses.
 *
 * Counts go to this site's own server (POST /api/reports, same origin), which
 * adds everyone's together and passes the total to our analytics service, so
 * the browser never talks to anything else. The "Bug reports" switch in the
 * footer and in settings turns it off; Global Privacy Control or Do Not Track
 * start it off.
 */
import { useSyncExternalStore } from "react";

declare const __SITE_VERSION__: string;

/** Upper bounds of the timing buckets in milliseconds (the same as fuwa's); one more holds anything longer. */
export const BOUNDS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000] as const;
const BUCKETS = BOUNDS_MS.length + 1;
/** Distinct entries of each kind a report holds; the server takes no more. */
const MAX_ENTRIES = 64;
const EVERY_MS = 5 * 60 * 1000;
const LONG_FRAME_MS = 50;
const KEY = "waifu:bug-reports";

type Timing = { buckets: number[]; sumMs: number };
type Pending = { errors: Map<string, number>; timings: Map<string, Timing>; usage: Map<string, number> };
const empty = (): Pending => ({ errors: new Map(), timings: new Map(), usage: new Map() });
let pending = empty();

// ---------------------------------------------------------------------------
// The switch: on unless this browser said otherwise, or asks sites not to track.

const listeners = new Set<() => void>();
function stored(): boolean | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "on" ? true : value === "off" ? false : null;
  } catch {
    return null;
  }
}
function privacySignal(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || navigator.doNotTrack === "1";
}
export function reportsOn(): boolean {
  if (typeof window === "undefined") return false;
  return stored() ?? !privacySignal();
}
export function setReportsOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Private mode: it holds until the tab closes.
  }
  if (!on) pending = empty();
  for (const l of listeners) l();
}
/** The switch, for components. Off while rendering on the server. */
export function useReportsOn(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    reportsOn,
    () => false,
  );
}

// ---------------------------------------------------------------------------

/** Letters, digits and `_.:/#@-`, as the server allows, and short. */
export const clean = (value: string, max: number) => value.replace(/[^A-Za-z0-9_.:/#@-]/g, "_").slice(0, max) || "unknown";

function bump(map: Map<string, number>, key: string, by = 1) {
  const now = map.get(key);
  if (now !== undefined) map.set(key, now + by);
  else if (map.size < MAX_ENTRIES) map.set(key, by);
}

export function reportError(kind: string, place: string) {
  if (reportsOn()) bump(pending.errors, `${clean(kind, 48)}\n${clean(place, 120)}`);
}

export function reportTiming(metric: string, ms: number) {
  if (!reportsOn() || !Number.isFinite(ms) || ms < 0) return;
  const key = clean(metric, 96);
  let timing = pending.timings.get(key);
  if (!timing) {
    if (pending.timings.size >= MAX_ENTRIES) return;
    timing = { buckets: Array<number>(BUCKETS).fill(0), sumMs: 0 };
    pending.timings.set(key, timing);
  }
  const at = BOUNDS_MS.findIndex((bound) => ms <= bound);
  timing.buckets[at === -1 ? BOUNDS_MS.length : at]!++;
  timing.sumMs += Math.round(ms);
}

export function reportUsage(feature: string) {
  if (reportsOn()) bump(pending.usage, clean(feature, 96));
}

// ---------------------------------------------------------------------------

let route = () => "page";
/** A route pattern ("/u/$username") as a place: "u/:username". */
export const placeOf = (routeId: string | undefined) => clean((routeId ?? "page").replace(/\$/g, ":").replace(/^\/+/, "") || "home", 60);

/** The first frame in the stack from this site's own files, as "assets/main-abc.js:1:2345". */
function ownFrame(stack: string | undefined): string | null {
  if (!stack) return null;
  for (const line of stack.split("\n")) {
    const at = line.indexOf(location.origin);
    if (at === -1) continue;
    const match = /^(\/[^\s?#)]*?\.(?:js|mjs|ts|tsx)):(\d+):(\d+)/.exec(line.slice(at + location.origin.length));
    if (match) return `${match[1]!.replace(/^\/+/, "")}:${match[2]}:${match[3]}`;
  }
  return null;
}

/** Counts something thrown and not caught, if it came from the site's own code. */
export function reportThrown(error: unknown, where = "uncaught") {
  if (!reportsOn()) return;
  const frame = ownFrame(error instanceof Error ? error.stack : undefined);
  // Browser extensions fail in here too; they aren't our bugs.
  if (!frame && error instanceof Error) return;
  const kind = error instanceof Error ? (/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(error.name) ? error.name : "Error") : typeof error;
  reportError(kind, `${where}:${route()}${frame ? `@${frame}` : ""}`);
}

function platform() {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua)
    ? "windows"
    : /Android/.test(ua)
      ? "android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "ios"
        : /CrOS/.test(ua)
          ? "chromeos"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macos"
            : /Linux/.test(ua)
              ? "linux"
              : "other";
  const browser = /Firefox\//.test(ua) ? "firefox" : /Chrome\/|Chromium\//.test(ua) ? "chromium" : /Safari\//.test(ua) ? "safari" : "other";
  return { platform: browser, os };
}

/** Takes what's waiting as a report body, or null when there's nothing. */
function take(): string | null {
  const taken = pending;
  if (!reportsOn() || (taken.errors.size === 0 && taken.timings.size === 0 && taken.usage.size === 0)) return null;
  pending = empty();
  return JSON.stringify({
    app: "web",
    version: typeof __SITE_VERSION__ === "string" ? __SITE_VERSION__ : "dev",
    ...platform(),
    errors: [...taken.errors].map(([key, count]) => {
      const [kind, place] = key.split("\n");
      return { kind, place, count };
    }),
    timings: [...taken.timings].map(([metric, t]) => ({ metric, buckets: t.buckets, sum_ms: t.sumMs })),
    usage: [...taken.usage].map(([feature, count]) => ({ feature, count })),
  });
}

/** Sends what's waiting. On the way out, as a beacon, which survives the page closing. */
function send(leaving: boolean) {
  const body = take();
  if (!body) return;
  if (leaving && navigator.sendBeacon?.("/api/reports", new Blob([body], { type: "application/json" }))) return;
  void fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}

let started = false;

/**
 * Starts counting: uncaught errors, how long the page took to be ready and
 * to paint its largest part, long frames, and page changes. Call once, in the
 * browser, with something that says which route is showing.
 */
export function startReports(currentRoute: () => string | undefined) {
  if (started || typeof window === "undefined") return;
  started = true;
  route = () => placeOf(currentRoute());
  window.addEventListener("error", (e) => reportThrown(e.error ?? new Error(e.message)));
  window.addEventListener("unhandledrejection", (e) => reportThrown(e.reason, "rejection"));
  reportTiming("page.ready", performance.now());

  const observe = (type: string, f: (entry: PerformanceEntry) => void) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(f)).observe({ type, buffered: true });
    } catch {
      // Not in this browser.
    }
  };
  observe("long-animation-frame", (entry) => entry.duration >= LONG_FRAME_MS && reportTiming("frame.long", entry.duration));
  // Largest paint: counted once, with the last candidate before the page is first hidden.
  let largest = 0;
  observe("largest-contentful-paint", (entry) => (largest = entry.startTime));

  let painted = false;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    if (!painted && largest > 0) reportTiming("page.largest_paint", largest);
    painted = true;
    send(true);
  });
  setInterval(() => send(false), EVERY_MS);
}

/** Times a page change, from the click to the new page being ready. */
export function pageChange(routeId: string | undefined, ms: number) {
  reportUsage(`page:${placeOf(routeId)}`);
  if (ms > 0) reportTiming("page.change", ms);
}
