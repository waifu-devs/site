/** The analytics service's HTTP contract. */
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiMiddleware, HttpApiSecurity } from "@effect/platform";
import { Schema } from "effect";
import { Batch } from "./Signals.ts";

// ---------------------------------------------------------------------------
// Reading: a bearer token only we have (ANALYTICS_READ_TOKEN).

export class ReadAccess extends HttpApiMiddleware.Tag<ReadAccess>()("ReadAccess", {
  failure: HttpApiError.Unauthorized,
  security: { bearer: HttpApiSecurity.bearer },
}) {}

const Count = Schema.Number;

/** One UTC day for one kind of hosting (see the `daily` view). */
export const Day = Schema.Struct({
  day: Schema.String,
  hosting: Schema.String,
  installs: Count,
  servers: Count,
  channels: Count,
  members: Count,
  accounts: Count,
  messages: Count,
  storage_bytes: Count,
  upload_bytes: Count,
  messages_sent: Count,
  new_accounts: Count,
  new_servers: Count,
});

export const Summary = Schema.Struct({
  days: Schema.Array(Day),
  /** Installs seen in the last 7 days, by the version they last reported. */
  versions: Schema.Array(Schema.Struct({ version: Schema.String, hosting: Schema.String, installs: Count })),
});
export type Summary = typeof Summary.Type;

// ---------------------------------------------------------------------------

export const Accepted = Schema.Struct({ accepted: Schema.Number });

export class FuwaApi extends HttpApiGroup.make("fuwa")
  .add(
    HttpApiEndpoint.post("ingest", "/v1/fuwa/events")
      .setPayload(Batch)
      .addSuccess(Accepted, { status: 202 })
      // An event dated more than a day ahead.
      .addError(HttpApiError.BadRequest)
      // The lake is unreachable and the buffer is full; try again later.
      .addError(HttpApiError.ServiceUnavailable),
  )
  .add(
    HttpApiEndpoint.get("summary", "/v1/fuwa/summary")
      .setUrlParams(Schema.Struct({ days: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 366))) }))
      .addSuccess(Summary)
      .middleware(ReadAccess),
  ) {}

export class HealthApi extends HttpApiGroup.make("health").add(HttpApiEndpoint.get("health", "/health").addSuccess(Schema.String)) {}

export class Api extends HttpApi.make("analytics").add(FuwaApi).add(HealthApi) {}
