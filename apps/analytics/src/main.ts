import { HttpApiBuilder, HttpMiddleware, HttpServer } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Layer } from "effect";
import { createServer } from "node:http";
import { AppLive, limitBody } from "./App.ts";

const ServerLive = HttpApiBuilder.serve((app) => HttpMiddleware.logger(limitBody(app))).pipe(
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
