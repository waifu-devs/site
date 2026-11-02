import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Layer } from "effect";
import { AppLive } from "./App.ts";
import { harden } from "./Middleware.ts";
import { MAX_REPORT_BYTES } from "./Reports.ts";

const ServerLive = HttpApiBuilder.serve(harden).pipe(
  Layer.provide(AppLive),
  HttpServer.withLogAddress,
  Layer.provide(
    Layer.unwrapEffect(
      Effect.gen(function* () {
        const port = yield* Config.integer("PORT").pipe(Config.withDefault(4100));
        // "::" also accepts IPv4, and Railway's private network is IPv6.
        const hostname = yield* Config.string("HOST").pipe(Config.withDefault("::"));
        return BunHttpServer.layer({
          port,
          hostname,
          // The app holds each body to its own limit (limitBody in App.ts); this is
          // Bun's own stop, well past the biggest of them.
          maxRequestBodySize: 2 * MAX_REPORT_BYTES,
          // Bun closes a connection that's quiet this long (10 seconds unless told),
          // even while its answer is being worked out, and a summary can take longer.
          // 255 seconds is as long as it goes, near Node's 300 a request.
          idleTimeout: 255,
        });
      }),
    ),
  ),
);

Layer.launch(ServerLive).pipe(BunRuntime.runMain);
