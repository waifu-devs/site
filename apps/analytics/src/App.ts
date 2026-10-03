import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Layer, Option, Schedule } from "effect";
import { HttpLive, ReadAccessLive } from "./Http.ts";
import { Ingest } from "./Ingest.ts";
import { Lake } from "./Lake.ts";
import { MaintenanceLive } from "./Maintenance.ts";
import { MAX_REPORT_BYTES } from "./Reports.ts";
import { MAX_BODY_BYTES } from "./Signals.ts";
import { migrate } from "./Tables.ts";

/** The lake, with its tables made. Two deploys starting at once may race on that, so it retries. */
export const LakeLive = Layer.effectDiscard(
  migrate.pipe(Effect.retry(Schedule.exponential("1 second").pipe(Schedule.intersect(Schedule.recurs(5))))),
).pipe(Layer.provideMerge(Lake.Default));

/** The HTTP API and everything behind it, minus the server itself. */
export const AppLive = HttpLive.pipe(
  Layer.provide(ReadAccessLive),
  Layer.provideMerge(Layer.mergeAll(Ingest.Default, MaintenanceLive)),
  Layer.provideMerge(LakeLive),
);

/** Signals are small, reports a little bigger: anything over its limit is turned away unread. */
export const limitBody = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const limit = request.url.split("?")[0]!.endsWith("/reports") ? MAX_REPORT_BYTES : MAX_BODY_BYTES;
    if (Number(request.headers["content-length"] ?? 0) > limit) return HttpServerResponse.empty({ status: 413 });
    return yield* HttpServerRequest.withMaxBodySize(app, Option.some(limit));
  }),
);
