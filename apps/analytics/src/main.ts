import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Layer } from "effect";
import { createServer } from "node:http";
import { AppLive } from "./App.ts";
import { harden } from "./Middleware.ts";

const ServerLive = HttpApiBuilder.serve(harden).pipe(
  Layer.provide(AppLive),
  HttpServer.withLogAddress,
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      port: Config.integer("PORT").pipe(Config.withDefault(4100)),
      // "::" also accepts IPv4, and Railway's private network is IPv6.
      host: Config.string("HOST").pipe(Config.withDefault("::")),
    }),
  ),
);

Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
