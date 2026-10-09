// What the public stats page may show of the analytics service's insights (src/lib/public-stats.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { publicInsights } from "../src/lib/public-stats.ts";
import type { Insights, UsageDay } from "../src/lib/stats.ts";

const day = (day: string, hosting: string, installs: number, n: number, agents: number | null = null): UsageDay => ({
  day,
  hosting,
  installs,
  accounts: n,
  agents,
  accounts_active_1d: n,
  accounts_active_30d: n,
  servers: n,
  members: n,
  channels: n,
  messages: n,
  message_bytes: n,
  attachments: n,
  attachment_bytes: n,
  storage_bytes: n,
  messages_sent: n,
  events: n,
});

const error = (kind: string, installs: number) => ({
  source: "fuwa",
  app: "server",
  version: "1.0.0",
  kind,
  place: "db",
  count: 9,
  installs,
  platforms: ["linux"],
  oses: ["debian"],
  first_seen: "2026-10-01",
  last_seen: "2026-10-02",
});

const insights = (parts: {
  days?: UsageDay[];
  usageVersions?: Insights["usage"]["versions"];
  versions?: Insights["versions"];
  errors?: Insights["problems"]["errors"];
}): Insights => ({
  days: 30,
  usage: { days: parts.days ?? [], versions: parts.usageVersions ?? [] },
  problems: { days: 30, errors: parts.errors ?? [], slow: [], usage: [] },
  reports: [],
  errors: [],
  timings: [],
  features: [],
  versions: parts.versions ?? [],
});

test("a lone self-hoster's day is added into the hosted row, not shown apart", () => {
  const shown = publicInsights(insights({ days: [day("2026-10-01", "hosted", 1, 100, 4), day("2026-10-01", "self_hosted", 1, 7)] }));
  assert.deepEqual(shown.usage.days, [{ ...day("2026-10-01", "hosted", 2, 107), agents: 4 }]);
});

test("a self-hosted day with too few installs and nothing to hide in is left out", () => {
  const shown = publicInsights(insights({ days: [day("2026-10-01", "self_hosted", 2, 7), day("2026-10-02", "self_hosted", 3, 9), day("2026-10-02", "hosted", 1, 5)] }));
  assert.deepEqual(shown.usage.days, [day("2026-10-02", "self_hosted", 3, 9), day("2026-10-02", "hosted", 1, 5)]);
});

test("agents stay unknown only where neither row counts them", () => {
  const [both] = publicInsights(insights({ days: [day("2026-10-01", "hosted", 4, 1, 2), day("2026-10-01", "self_hosted", 1, 1, 3)] })).usage.days;
  assert.equal(both!.agents, 5);
  const [neither] = publicInsights(insights({ days: [day("2026-10-01", "hosted", 4, 1), day("2026-10-01", "self_hosted", 1, 1)] })).usage.days;
  assert.equal(neither!.agents, null);
});

test("versions and errors seen by too few self-hosters are left out", () => {
  const shown = publicInsights(
    insights({
      usageVersions: [
        { version: "1.2.0", hosting: "self_hosted", installs: 1 },
        { version: "1.1.0", hosting: "self_hosted", installs: 3 },
        { version: "1.2.0", hosting: "hosted", installs: 1 },
      ],
      versions: [
        { source: "fuwa", app: "server", version: "1.2.0", installs: 2 },
        { source: "site", app: "web", version: "abc", installs: 40 },
      ],
      errors: [error("Timeout", 1), error("Refused", 3)],
    }),
  );
  assert.deepEqual(shown.usage.versions, [
    { version: "1.1.0", hosting: "self_hosted", installs: 3 },
    { version: "1.2.0", hosting: "hosted", installs: 1 },
  ]);
  assert.deepEqual(shown.versions, [{ source: "site", app: "web", version: "abc", installs: 40 }]);
  assert.deepEqual(
    shown.problems.errors.map((e) => e.kind),
    ["Refused"],
  );
});
