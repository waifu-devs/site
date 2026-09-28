/**
 * The anonymous usage signals fuwa servers send home (unless their operator
 * turns them off). Version 1 of the contract agreed with the fuwa server:
 *
 *   POST /v1/fuwa/events  { schema: 1, install: {...}, events: [...] }
 *
 * Nothing here identifies a person or a community: the install id is a random
 * UUID the instance makes up once, and everything else is versions and counts.
 * Unknown fields are ignored, so senders can add fields before a schema bump.
 */
import { Schema } from "effect";

/** Most events one request may carry. */
export const MAX_EVENTS = 100;
/** Largest request body the ingest reads. */
export const MAX_BODY_BYTES = 64 * 1024;

/** A counter: a whole number, zero or more. */
const Count = Schema.NonNegativeInt;
/** A short label such as a version, an OS or an architecture. */
const Label = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64));

/** The instance sending the batch. */
export const Install = Schema.Struct({
  /** Random, made once per instance; never derived from a host, address or person. */
  id: Schema.UUID,
  /** fuwa's version (semver). */
  version: Label,
  os: Label,
  arch: Label,
  /** Whether this is our hosted instance or someone's own. */
  hosting: Schema.Literal("self_hosted", "hosted"),
});
export type Install = typeof Install.Type;

/** A periodic snapshot of an instance: its totals, plus what happened since the last one. */
export const Heartbeat = Schema.Struct({
  /** Unique per event, so a retried batch isn't counted twice. */
  id: Schema.UUID,
  type: Schema.Literal("heartbeat"),
  /** When the snapshot was taken. */
  at: Schema.Date,
  uptime_seconds: Count,
  /** How long the `period` counters cover (since the previous heartbeat). */
  period_seconds: Count,
  config: Schema.Struct({
    standalone_accounts: Schema.Boolean,
    linked_accounts: Schema.Boolean,
    /** "open", "closed" or "off" today; kept as text so a new mode doesn't break old ingests. */
    signups: Schema.String.pipe(Schema.maxLength(32)),
  }),
  totals: Schema.Struct({
    servers: Count,
    channels: Count,
    members: Count,
    accounts_standalone: Count,
    accounts_linked: Count,
    messages: Count,
    storage_bytes: Count,
    upload_bytes: Count,
  }),
  period: Schema.Struct({
    messages: Count,
    active_accounts: Count,
    new_accounts: Count,
    new_servers: Count,
  }),
});
export type Heartbeat = typeof Heartbeat.Type;

/**
 * Any other kind of event. A sender newer than this ingest may send types it
 * doesn't know yet; they're kept as raw JSON instead of failing the batch.
 */
export const OtherEvent = Schema.Struct(
  {
    id: Schema.UUID,
    type: Schema.String.pipe(
      Schema.pattern(/^[a-z][a-z0-9_.]{0,63}$/),
      Schema.filter((type) => type !== "heartbeat" || "a heartbeat must match the heartbeat fields"),
    ),
    at: Schema.Date,
  },
  Schema.Record({ key: Schema.String, value: Schema.Unknown }),
);
export type OtherEvent = typeof OtherEvent.Type;

export const Event = Schema.Union(Heartbeat, OtherEvent);
export type Event = typeof Event.Type;

export const Batch = Schema.Struct({
  schema: Schema.Literal(1),
  install: Install,
  events: Schema.Array(Event).pipe(Schema.minItems(1), Schema.maxItems(MAX_EVENTS)),
});
export type Batch = typeof Batch.Type;

export const isHeartbeat = (event: Event): event is Heartbeat => event.type === "heartbeat";
