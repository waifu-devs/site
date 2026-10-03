import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { ConfigProvider, Effect, HashMap, Layer, List, Logger, ManagedRuntime } from "effect";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpLive, ReadAccessLive } from "../src/Http.ts";
import { Ingest } from "../src/Ingest.ts";
import { Lake, LakeError } from "../src/Lake.ts";
import { harden } from "../src/Middleware.ts";

// A lake that's down: every write fails, so accepted signals pile up in the buffer.
const DownLake = Layer.succeed(
  Lake,
  Lake.make({
    run: () => Effect.fail(new LakeError({ cause: "down" })),
    query: () => Effect.fail(new LakeError({ cause: "down" })),
    transaction: () => Effect.fail(new LakeError({ cause: "down" })),
  }),
);

const config = ConfigProvider.fromMap(
  new Map([
    ["ANALYTICS_READ_TOKEN", "test-read-token"],
    ["INGEST_FLUSH_INTERVAL", "1 hour"],
    // Room for three signals or so.
    ["INGEST_MAX_PENDING_BYTES", "4000"],
  ]),
);

// What the request log said, to check what it leaves out.
const logged: Array<{ message: unknown; annotations: Record<string, unknown> }> = [];
const CaptureLogs = Logger.replace(
  Logger.defaultLogger,
  Logger.make(({ message, annotations }) => {
    logged.push({ message: List.isList(message) ? List.toArray(message) : message, annotations: Object.fromEntries(HashMap.toEntries(annotations)) });
  }),
);

// The real Node server, as in production: body limits are enforced where Node reads the body.
let runtime: ManagedRuntime.ManagedRuntime<HttpServer.HttpServer, unknown>;
let base: string;
beforeAll(async () => {
  runtime = ManagedRuntime.make(
    HttpApiBuilder.serve(harden).pipe(
      Layer.provide(HttpLive.pipe(Layer.provide(ReadAccessLive), Layer.provide(Ingest.Default), Layer.provide(DownLake))),
      Layer.provideMerge(NodeHttpServer.layer(createServer, { port: 0, host: "127.0.0.1" })),
      Layer.provide(CaptureLogs),
      Layer.provide(Layer.setConfigProvider(config)),
    ),
  );
  const address = (await runtime.runPromise(HttpServer.HttpServer)).address;
  if (address._tag !== "TcpAddress") throw new Error("expected a TCP address");
  base = `http://${address.hostname}:${address.port}`;
});
afterAll(() => runtime.dispose());

const ulid = () => Array.from({ length: 26 }, () => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[Math.floor(Math.random() * 32)]).join("");

const signal = (extra: object = {}) => ({
  schema: "fuwa.signal.v1",
  install_id: ulid(),
  sent_at: Date.now(),
  version: "0.1.0",
  os: "linux",
  arch: "x86_64",
  uptime_seconds: 60,
  config: { local_accounts: "open", linked_accounts: false, server_creation: "everyone", encryption: false, limits_configured: false },
  totals: {
    accounts: 1,
    accounts_active_1d: 1,
    accounts_active_30d: 1,
    servers: 1,
    discoverable_servers: 0,
    members: 1,
    channels: 1,
    messages: 1,
    messages_sent: 1,
    message_bytes: 1,
    attachments: 0,
    attachment_bytes: 0,
    events: 1,
    storage_bytes: 1,
  },
  ...extra,
});

const post = (body: string | ReadableStream<Uint8Array>, path = "/v1/fuwa/signals") =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" } as RequestInit);

/** A body sent in chunks, with no Content-Length to go by. */
const streamed = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(text);
      for (let i = 0; i < bytes.length; i += 1024) controller.enqueue(bytes.slice(i, i + 1024));
      controller.close();
    },
  });

describe("limits", () => {
  it("turns away bodies over 8 KB unread, unknown fields included", async () => {
    const big = JSON.stringify(signal({ notes: "x".repeat(9 * 1024) }));
    expect((await post(big)).status).toBe(413);
    // Without a Content-Length, reading stops at the limit and the connection is dropped.
    const streamedStatus = await post(streamed(big)).then((response) => response.status, () => "closed");
    expect([413, "closed"]).toContain(streamedStatus);
    // A signal under the limit still gets in the same way.
    expect((await post(streamed(JSON.stringify(signal())))).status).toBe(202);
  });

  it("refuses signals once the buffer holds INGEST_MAX_PENDING_BYTES, and says to come back later", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await post(JSON.stringify(signal()))).status);
    const full = statuses.indexOf(503);
    expect(full).toBeGreaterThan(0);
    expect(statuses.slice(0, full).every((status) => status === 202)).toBe(true);
    expect(statuses.slice(full).every((status) => status === 503)).toBe(true);
  });

  it("sends the security headers, on errors too", async () => {
    const response = await post("{", "/v1/fuwa/signals?token=secret");
    expect(response.status).toBe(400);
    expect(response.headers.get("strict-transport-security")).toContain("max-age=");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("logs paths without their query strings, and no request values", async () => {
    logged.length = 0;
    await post(JSON.stringify(signal({ install_id: '"private value"' })), "/v1/fuwa/signals?token=secret");
    const requests = logged.filter((entry) => "http.path" in entry.annotations);
    expect(requests).toHaveLength(1);
    expect(requests[0].annotations["http.path"]).toBe("/v1/fuwa/signals");
    expect(JSON.stringify(logged)).not.toContain("secret");
    expect(JSON.stringify(logged)).not.toContain("private value");
  });
  it("turns scanners away with a 404 before routing, and doesn't log them", async () => {
    logged.length = 0;
    for (const path of ["/.env", "/wp-login.php", "/.git/config", "/actuator/env", "/v1/.env"]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status, path).toBe(404);
      expect(await response.text()).toBe("not found\n");
      expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    }
    expect(logged.filter((entry) => "http.path" in entry.annotations)).toHaveLength(0);
    // The real routes still answer.
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await post(JSON.stringify(signal()))).status).not.toBe(404);
  });

  it("tells shared caches to keep nothing that doesn't say otherwise", async () => {
    const response = await post("{", "/v1/fuwa/signals");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
