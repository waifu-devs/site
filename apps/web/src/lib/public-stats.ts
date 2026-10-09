import type { Insights, UsageDay } from "./stats.ts";

/**
 * The stats page is public, so no row it gets may stand for one or two
 * self-hosters: fewer installs than this and the numbers are someone's own.
 * Our hosted instance's rows are ours to show.
 */
export const FEWEST_INSTALLS = 3;

const NUMBERS = [
  "installs",
  "accounts",
  "accounts_active_1d",
  "accounts_active_30d",
  "servers",
  "members",
  "channels",
  "messages",
  "message_bytes",
  "attachments",
  "attachment_bytes",
  "storage_bytes",
  "messages_sent",
  "events",
] as const satisfies ReadonlyArray<keyof UsageDay>;

const few = (row: { hosting?: string; installs: number }) => row.hosting !== "hosted" && row.installs < FEWEST_INSTALLS;

/** Adds `small` into `into`; agents stay null only where neither counts them. */
function fold(into: UsageDay, small: UsageDay): UsageDay {
  const sum = { ...into };
  for (const key of NUMBERS) sum[key] = into[key] + small[key];
  sum.agents = into.agents === null && small.agents === null ? null : (into.agents ?? 0) + (small.agents ?? 0);
  return sum;
}

/**
 * Insights as the public page may show them. A day's self-hosted row with too
 * few installs is added into that day's hosted row, so it still counts in the
 * day's totals, and is left out when there's no hosted row to hide it in.
 * Versions and errors seen by too few self-hosters are left out.
 */
export function publicInsights(insights: Insights): Insights {
  const hosted = new Map<string, UsageDay>();
  for (const row of insights.usage.days) if (row.hosting === "hosted") hosted.set(row.day, row);
  for (const row of insights.usage.days) {
    const into = hosted.get(row.day);
    if (few(row) && into) hosted.set(row.day, fold(into, row));
  }
  const days = insights.usage.days.flatMap((row) => (row.hosting === "hosted" ? [hosted.get(row.day)!] : few(row) ? [] : [row]));

  return {
    ...insights,
    usage: { days, versions: insights.usage.versions.filter((v) => !few(v)) },
    problems: { ...insights.problems, errors: insights.problems.errors.filter((e) => !few(e)) },
    versions: insights.versions.filter((v) => !few(v)),
  };
}
