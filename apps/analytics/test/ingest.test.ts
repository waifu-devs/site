import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { ConfigProvider, Layer } from "effect";
import { randomUUID } from "node:crypto";
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
    ["INGEST_MAX_PENDING", "20"],
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
    new Request("http://analytics.test/v1/fuwa/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const summary = (token = TOKEN) =>
  web.handler(new Request("http://analytics.test/v1/fuwa/summary?days=7", { headers: { authorization: `Bearer ${token}` } }));

const heartbeat = (at: Date, messages: number) => ({
  id: randomUUID(),
  type: "heartbeat",
  at: at.toISOString(),
  uptime_seconds: 60,
  period_seconds: 86_400,
  config: { standalone_accounts: true, linked_accounts: true, signups: "open" },
  totals: {
    servers: 2,
    channels: 9,
    members: 30,
    accounts_standalone: 20,
    accounts_linked: 5,
    messages: 1_000,
    storage_bytes: 4_096,
    upload_bytes: 0,
  },
  period: { messages, active_accounts: 4, new_accounts: 1, new_servers: 0 },
  // Fields a newer fuwa may add are ignored.
  something_new: true,
});

const install = { id: randomUUID(), version: "0.1.0", os: "linux", arch: "x86_64", hosting: "self_hosted" };

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
  it("stores heartbeats once, however often a batch is retried", async () => {
    const now = new Date();
    const batch = {
      schema: 1,
      install,
      events: [heartbeat(now, 7), { id: randomUUID(), type: "server.created", at: now.toISOString(), template: "cozy" }],
    };
    const first = await post(batch);
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ accepted: 2 });
    expect((await post(batch)).status).toBe(202);

    const body = await waitForSummary((body) => body.days.length > 0);
    expect(body.days).toEqual([
      {
        day: now.toISOString().slice(0, 10),
        hosting: "self_hosted",
        installs: 1,
        servers: 2,
        channels: 9,
        members: 30,
        accounts: 25,
        messages: 1_000,
        storage_bytes: 4_096,
        upload_bytes: 0,
        messages_sent: 7,
        new_accounts: 1,
        new_servers: 0,
      },
    ]);
    expect(body.versions).toEqual([{ version: "0.1.0", hosting: "self_hosted", installs: 1 }]);
  });

  it("refuses payloads that don't match the contract", async () => {
    const valid = heartbeat(new Date(), 1);
    const cases = [
      { schema: 2, install, events: [valid] },
      { schema: 1, install: { ...install, id: "my-hostname" }, events: [valid] },
      { schema: 1, install, events: [] },
      { schema: 1, install, events: [{ ...valid, totals: { ...valid.totals, messages: -1 } }] },
      { schema: 1, install, events: [{ ...valid, period: undefined }] },
      { schema: 1, install, events: [heartbeat(new Date(Date.now() + 3 * 86_400_000), 1)] },
    ];
    for (const body of cases) expect((await post(body)).status).toBe(400);
  });

  it("asks senders to come back later when the buffer is full", async () => {
    const batch = { schema: 1, install, events: Array.from({ length: 21 }, () => heartbeat(new Date(), 1)) };
    expect((await post(batch)).status).toBe(503);
  });
});

describe("summary", () => {
  it("needs the read token", async () => {
    expect((await summary("wrong")).status).toBe(401);
    expect((await web.handler(new Request("http://analytics.test/v1/fuwa/summary"))).status).toBe(401);
  });
});
