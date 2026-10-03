/** What the status page shows, and what GET /status.json answers. */

/** Up and quick, up but slow, not answering, or not checked lately. */
export type StatusState = "up" | "slow" | "down" | "unknown";

/** One UTC day of checks on one part. */
export type StatusDay = {
  day: string;
  checks: number;
  up: number;
  slow: number;
  /** Average answer time of the checks it answered. */
  avgMs: number | null;
};

export type StatusComponent = {
  id: string;
  /** Which service it's part of. */
  group: "fuwa" | "site";
  name: string;
  description: string;
  state: StatusState;
  latencyMs: number | null;
  checkedAt: string | null;
  /** When it went into its current state. */
  since: string | null;
  /** Share of checks answered over the days shown, or null with none. */
  uptime: number | null;
  /** Days with checks, oldest first (days without any are missing). */
  days: StatusDay[];
};

export type StatusIncident = {
  id: string;
  component: string;
  name: string;
  reason: string;
  startedAt: string;
  endedAt: string | null;
};

export type StatusReport = {
  /** When this answer was put together. */
  at: string;
  /** How many days `days` covers, today included. */
  window: number;
  /** How often each part is checked. */
  everySeconds: number;
  components: StatusComponent[];
  /** The latest incidents, newest first, open ones included. */
  incidents: StatusIncident[];
};
