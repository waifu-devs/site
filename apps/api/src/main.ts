import { FetchHttpClient, HttpApiBuilder, HttpMiddleware, HttpServer } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Layer } from "effect";
import { createServer } from "node:http";
import { AuthenticationLive, Issuer, IssuerRoutes, LinkedAuthenticationLive, OptionalAuthenticationLive } from "./Auth.ts";
import { DbLive } from "./Db.ts";
import { HttpLive } from "./Http.ts";
import { MediaRoutes, MediaStoreLive } from "./Media.ts";
import { Posts } from "./Posts.ts";
import { Repos } from "./Repos.ts";
import { Themes } from "./Themes.ts";
import { Users } from "./Users.ts";

const ServicesLive = Layer.mergeAll(Users.Default, Themes.Default, Posts.Default, Repos.Default, MediaStoreLive).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provideMerge(DbLive),
);
const IssuerLive = Issuer.Default.pipe(Layer.provide(FetchHttpClient.layer), Layer.provideMerge(ServicesLive));

const ServerLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(IssuerRoutes),
  Layer.provide(MediaRoutes),
  Layer.provide(HttpLive),
  Layer.provide([AuthenticationLive, OptionalAuthenticationLive, LinkedAuthenticationLive]),
  Layer.provide(IssuerLive),
  HttpServer.withLogAddress,
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      port: Config.integer("PORT").pipe(Config.withDefault(4000)),
      // "::" also accepts IPv4, and Railway's private network is IPv6.
      host: Config.string("HOST").pipe(Config.withDefault("::")),
    }),
  ),
);

Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
