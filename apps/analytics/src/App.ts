import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Layer, Option, Schedule } from "effect";
import { HttpLive, ReadAccessLive } from "./Http.ts";
import { Ingest } from "./Ingest.ts";
import { Lake } from "./Lake.ts";
import { MaintenanceLive } from "./Maintenance.ts";
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

/** Signals are small: anything bigger than MAX_BODY_BYTES is turned away unread. */
export const limitBody = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (Number(request.headers["content-length"] ?? 0) > MAX_BODY_BYTES) return HttpServerResponse.empty({ status: 413 });
    return yield* HttpServerRequest.withMaxBodySize(app, Option.some(MAX_BODY_BYTES));
  }),
);
