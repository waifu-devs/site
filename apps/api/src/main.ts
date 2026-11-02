import { FetchHttpClient, HttpApiBuilder, HttpServer } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Layer } from "effect";
import { AuthenticationLive, Issuer, IssuerRoutes, LinkedAuthenticationLive, OptionalAuthenticationLive } from "./Auth.ts";
import { DbLive } from "./Db.ts";
import { HttpLive } from "./Http.ts";
import { MediaRoutes, MediaStoreLive } from "./Media.ts";
import { harden, MAX_BODY_BYTES } from "./Middleware.ts";
import { Posts } from "./Posts.ts";
import { Repos } from "./Repos.ts";
import { Themes } from "./Themes.ts";
import { Users } from "./Users.ts";

const ServicesLive = Layer.mergeAll(Users.Default, Themes.Default, Posts.Default, Repos.Default, MediaStoreLive).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provideMerge(DbLive),
);
const IssuerLive = Issuer.Default.pipe(Layer.provide(FetchHttpClient.layer), Layer.provideMerge(ServicesLive));

const ServerLive = HttpApiBuilder.serve(harden).pipe(
  Layer.provide(IssuerRoutes),
  Layer.provide(MediaRoutes),
  Layer.provide(HttpLive),
  Layer.provide([AuthenticationLive, OptionalAuthenticationLive, LinkedAuthenticationLive]),
  Layer.provide(IssuerLive),
  HttpServer.withLogAddress,
  Layer.provide(
    Layer.unwrapEffect(
      Effect.gen(function* () {
        const port = yield* Config.integer("PORT").pipe(Config.withDefault(4000));
        // "::" also accepts IPv4, and Railway's private network is IPv6.
        const hostname = yield* Config.string("HOST").pipe(Config.withDefault("::"));
        return BunHttpServer.layer({
          port,
          hostname,
          // The app holds bodies to MAX_BODY_BYTES (limitBody in Middleware.ts);
          // this is Bun's own stop, past it.
          maxRequestBodySize: 2 * MAX_BODY_BYTES,
          // Bun closes a connection that's quiet this long (10 seconds unless told),
          // even while its answer is being worked out, as when GitHub is slow.
          // 255 seconds is as long as it goes, near Node's 300 a request.
          idleTimeout: 255,
        });
      }),
    ),
  ),
);

Layer.launch(ServerLive).pipe(BunRuntime.runMain);
