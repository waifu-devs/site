/**
 * The stats page's data, as the analytics service sends it (apps/analytics,
 * GET /v1/insights). Every number is a sum over many installs or reports.
 */

/** Who may open /stats while it's private: GitHub account ids, which never change hands (Juan's). */
export const STATS_ADMINS: readonly number[] = [21351290];
/** Flip to true to let everyone see /stats. */
export const STATS_PUBLIC = false;

/** Ranges the page offers, in days. */
export const RANGES = [30, 90, 365] as const;
export type Range = (typeof RANGES)[number];

export type UsageDay = {
  day: string;
  hosting: string;
  installs: number;
  accounts: number;
  accounts_active_1d: number;
  accounts_active_30d: number;
  servers: number;
  members: number;
  channels: number;
  messages: number;
  message_bytes: number;
  attachments: number;
  attachment_bytes: number;
  storage_bytes: number;
  messages_sent: number;
  events: number;
};

export type Insights = {
  days: number;
  usage: { days: UsageDay[]; versions: Array<{ version: string; hosting: string; installs: number }> };
  problems: {
    days: number;
    errors: Array<{
      source: string;
      app: string;
      version: string;
      kind: string;
      place: string;
      count: number;
      installs: number;
      platforms: string[];
      oses: string[];
      first_seen: string;
      last_seen: string;
    }>;
    slow: Array<{ source: string; app: string; metric: string; count: number; avg_ms: number; p50_ms: number; p95_ms: number; p99_ms: number; over_1s: number }>;
    usage: Array<{ source: string; app: string; feature: string; count: number }>;
  };
  reports: Array<{ day: string; source: string; reports: number; senders: number; dropped: number }>;
  errors: Array<{ day: string; source: string; app: string; count: number; kinds: number }>;
  timings: Array<{ day: string; source: string; app: string; metric: string; count: number; avg_ms: number; p50_ms: number; p95_ms: number }>;
  features: Array<{ day: string; source: string; app: string; feature: string; count: number }>;
};

/** The apps reports come from, in the order (and so the colors) the page always uses. */
export const APPS = [
  { key: "fuwa:server", label: "fuwa server" },
  { key: "fuwa:web", label: "fuwa web" },
  { key: "fuwa:desktop", label: "fuwa desktop" },
  { key: "site:web", label: "waifu.dev" },
] as const;
export type AppKey = (typeof APPS)[number]["key"];
export const appKey = (row: { source: string; app: string }) => `${row.source}:${row.app}`;
export const appLabel = (key: string) => APPS.find((a) => a.key === key)?.label ?? key.replace(":", " ");
