import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { ConfigProvider, Layer } from "effect";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Summary } from "../src/Api.ts";
import { AppLive } from "../src/App.ts";

// A throwaway lake on disk: a DuckDB-file catalog and a local data directory.
const directory = mkdtempSync(join(tmpdir(), "analytics-test-"));
const TOKEN = "test-read-token";

const config = ConfigProvider.fromMap(
  new Map([
    ["LAKE_LOCAL_DIRECTORY", directory],
    ["ANALYTICS_READ_TOKEN", TOKEN],
    ["INGEST_FLUSH_INTERVAL", "100 millis"],
      ]),
).pipe(ConfigProvider.orElse(() => ConfigProvider.fromEnv()));

let web: ReturnType<typeof HttpApiBuilder.toWebHandler>;
beforeAll(() => {
  web = HttpApiBuilder.toWebHandler(
    Layer.mergeAll(AppLive, HttpServer.layerContext).pipe(Layer.provide(Layer.setConfigProvider(config))),
  );
});
afterAll(async () => {
  await web.dispose();
  rmSync(directory, { recursive: true, force: true });
});

const post = (body: unknown) =>
  web.handler(
    new Request("http://analytics.test/v1/fuwa/signals", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "fuwa/0.1.0" },
      body: JSON.stringify(body),
    }),
  );

const summary = (token = TOKEN) =>
  web.handler(new Request("http://analytics.test/v1/fuwa/summary?days=7", { headers: { authorization: `Bearer ${token}` } }));

// A ULID: 26 characters of Crockford base32.
const ulid = () => Array.from({ length: 26 }, () => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[Math.floor(Math.random() * 32)]).join("");

const signal = (installId: string, sentAt: Date, messagesSent: number, extra: object = {}) => ({
  schema: "fuwa.signal.v1",
  install_id: installId,
  sent_at: sentAt.getTime(),
  version: "0.1.0",
  os: "linux",
  arch: "x86_64",
  uptime_seconds: 60,
  config: { local_accounts: "open", linked_accounts: false, server_creation: "everyone", encryption: false, limits_configured: false },
  totals: {
    accounts: 12,
    accounts_active_1d: 3,
    accounts_active_30d: 9,
    servers: 2,
    discoverable_servers: 1,
    members: 14,
    channels: 6,
    messages: 1_200,
    messages_sent: messagesSent,
    message_bytes: 90_000,
    attachments: 0,
    attachment_bytes: 0,
    events: 1_700,
    storage_bytes: 1_048_576,
  },
  ...extra,
});

/** Polls until the flushed rows show up in the summary. */
const waitForSummary = async (ready: (body: Summary) => boolean) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const body = (await (await summary()).json()) as Summary;
    if (ready(body)) return body;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("the summary never caught up");
};

describe("ingest", () => {
  it("counts each signal once and activity from the lifetime counters", async () => {
    const install = ulid();
    const now = Date.now();
    const earlier = signal(install, new Date(now - 60_000), 1_500);
    // A field a newer fuwa might add rides along in the raw JSON.
    const later = signal(install, new Date(now), 1_540, { hosting: "self_hosted", voice_minutes: 3 });
    const first = await post(earlier);
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ accepted: 1 });
    // Delivered twice, counted once.
    expect((await post(later)).status).toBe(202);
    expect((await post(later)).status).toBe(202);
    // Our hosted instance, on a build that counts its agents.
    const hosted = signal(ulid(), new Date(now), 10, { hosting: "hosted" });
    expect((await post({ ...hosted, totals: { ...hosted.totals, agents: 2 } })).status).toBe(202);

    const body = await waitForSummary((body) => body.days.length === 2);
    const today = new Date(now).toISOString().slice(0, 10);
    expect(body.days.find((day) => day.hosting === "self_hosted")).toEqual({
      day: today,
      hosting: "self_hosted",
      installs: 1,
      accounts: 12,
      // A build from before agents.
      agents: null,
      accounts_active_1d: 3,
      accounts_active_30d: 9,
      servers: 2,
      members: 14,
      channels: 6,
      messages: 1_200,
      message_bytes: 90_000,
      attachments: 0,
      attachment_bytes: 0,
      storage_bytes: 1_048_576,
      messages_sent: 40,
      events: 0,
    });
    expect(body.days.find((day) => day.hosting === "hosted")).toMatchObject({ installs: 1, accounts: 12, agents: 2 });
    expect(body.versions).toEqual([
      { version: "0.1.0", hosting: "hosted", installs: 1 },
      { version: "0.1.0", hosting: "self_hosted", installs: 1 },
    ]);
  });

  it("refuses signals that don't match the contract", async () => {
    const valid = signal(ulid(), new Date(), 1);
    const cases = [
      { ...valid, schema: "fuwa.signal.v2" },
      { ...valid, install_id: "my-hostname" },
      { ...valid, hosting: "cloud" },
      { ...valid, totals: { ...valid.totals, messages: -1 } },
      { ...valid, config: undefined },
      signal(ulid(), new Date(Date.now() + 3 * 86_400_000), 1),
    ];
    for (const body of cases) expect((await post(body)).status).toBe(400);
  });
});

describe("summary", () => {
  it("needs the read token", async () => {
    expect((await summary("wrong")).status).toBe(401);
    expect((await web.handler(new Request("http://analytics.test/v1/fuwa/summary"))).status).toBe(401);
  });
});
