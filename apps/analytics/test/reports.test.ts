import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { ConfigProvider, Layer } from "effect";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReportSummary } from "../src/Api.ts";
import { AppLive } from "../src/App.ts";
import { percentile } from "../src/ReportSummary.ts";

const directory = mkdtempSync(join(tmpdir(), "analytics-reports-test-"));
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

const post = (path: string, body: unknown) =>
  web.handler(
    new Request(`http://analytics.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const read = (query = "", token = TOKEN) =>
  web.handler(new Request(`http://analytics.test/v1/reports/summary${query}`, { headers: { authorization: `Bearer ${token}` } }));

const ulid = () => Array.from({ length: 26 }, () => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[Math.floor(Math.random() * 32)]).join("");

const BOUNDS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000];
const buckets = (at: Record<number, number>) => Array.from({ length: BOUNDS.length + 1 }, (_, i) => at[i] ?? 0);
const web_ = { app: "web", version: "0.1.0", platform: "chromium", os: "linux" };
const server = { app: "server", version: "0.1.0", platform: "server", os: "linux" };

const report = (schema: string, extra: object = {}) => ({
  schema,
  report_id: ulid(),
  install_id: ulid(),
  hosting: "self_hosted",
  part: "all",
  since: Date.now() - 3_600_000,
  sent_at: Date.now(),
  bounds_ms: BOUNDS,
  errors: [
    { ...web_, kind: "TypeError", place: "render:_instance/_server@assets/index-abc.js:1:2345", count: 3 },
    { ...server, kind: "panic", place: "server/src/api/messages.rs:120", count: 1 },
  ],
  timings: [
    // 90 quick, 10 slow (over a second).
    { ...server, metric: "rpc:MessageService/SendMessage", buckets: buckets({ 3: 90, 9: 10 }), count: 100, sum_ms: 90 * 40 + 10 * 2000 },
    { ...web_, metric: "startup", buckets: buckets({ 7: 1 }), count: 1, sum_ms: 900 },
  ],
  usage: [{ ...web_, feature: "message.send", count: 7 }],
  dropped: 0,
  ...extra,
});

const waitFor = async (query: string, ready: (body: ReportSummary) => boolean) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const body = (await (await read(query)).json()) as ReportSummary;
    if (ready(body)) return body;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("the summary never caught up");
};

describe("reports", () => {
  it("adds up bugs, slow paths and feature use, each report once", async () => {
    const first = report("fuwa.report.v1", { future_field: true });
    const response = await post("/v1/fuwa/reports", first);
    expect(response.status).toBe(202);
    // Delivered twice, counted once.
    expect((await post("/v1/fuwa/reports", first)).status).toBe(202);
    // Another instance with the same bug.
    expect((await post("/v1/fuwa/reports", report("fuwa.report.v1"))).status).toBe(202);
    // The site's web server, with no install id.
    const site = report("site.report.v1", { install_id: undefined, part: "web", errors: [], timings: [], usage: [{ ...web_, feature: "page.view", count: 2 }] });
    expect((await post("/v1/site/reports", site)).status).toBe(202);

    const body = await waitFor("?days=7", (body) => body.usage.length === 2 && body.errors.length === 2);
    expect(body.errors[0]).toMatchObject({ source: "fuwa", app: "web", kind: "TypeError", count: 6, installs: 2, platforms: ["chromium"], oses: ["linux"] });
    expect(body.errors[1]).toMatchObject({ app: "server", kind: "panic", place: "server/src/api/messages.rs:120", count: 2 });
    const send = body.slow.find((row) => row.metric === "rpc:MessageService/SendMessage")!;
    expect(send).toEqual({
      source: "fuwa",
      app: "server",
      metric: "rpc:MessageService/SendMessage",
      count: 200,
      avg_ms: 236,
      p50_ms: 50,
      p95_ms: 5000,
      p99_ms: 5000,
      over_1s: 20,
    });
    // Slowest first.
    expect(body.slow[0]!.metric).toBe("rpc:MessageService/SendMessage");
    expect(body.usage).toEqual([
      { source: "fuwa", app: "web", feature: "message.send", count: 14 },
      { source: "site", app: "web", feature: "page.view", count: 2 },
    ]);

    const onlySite = (await (await read("?source=site")).json()) as ReportSummary;
    expect(onlySite.errors).toEqual([]);
    expect(onlySite.usage.map((row) => row.feature)).toEqual(["page.view"]);
  });

  it("refuses reports that don't match the contract", async () => {
    const valid = report("fuwa.report.v1");
    const cases: Array<[string, object]> = [
      ["/v1/fuwa/reports", { ...valid, schema: "site.report.v1" }],
      ["/v1/site/reports", valid],
      ["/v1/fuwa/reports", { ...valid, report_id: "not-a-ulid" }],
      ["/v1/fuwa/reports", { ...valid, errors: [{ ...valid.errors[0], place: "chat with someone@example.com" }] }],
      ["/v1/fuwa/reports", { ...valid, usage: [{ ...web_, feature: "x", count: -1 }] }],
      ["/v1/fuwa/reports", { ...valid, sent_at: Date.now() + 3 * 86_400_000 }],
    ];
    for (const [path, body] of cases) expect((await post(path, body)).status).toBe(400);
  });

  it("needs the read token", async () => {
    expect((await read("", "wrong")).status).toBe(401);
  });
});

describe("percentile", () => {
  it("reads the bucket bound where the share is reached", () => {
    expect(percentile([10, 100], [5, 4, 1], 10, 0.5)).toBe(10);
    expect(percentile([10, 100], [5, 4, 1], 10, 0.9)).toBe(100);
    // Past the last bound reads as the last bound.
    expect(percentile([10, 100], [5, 4, 1], 10, 0.99)).toBe(100);
    expect(percentile([10, 100], [0, 0, 0], 0, 0.5)).toBe(0);
  });
});
