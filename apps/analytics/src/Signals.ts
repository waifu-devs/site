/**
 * The anonymous usage signal fuwa servers send home (unless their operator
 * turns it off), as the fuwa server defines it:
 *
 *   POST /v1/fuwa/signals  { schema: "fuwa.signal.v1", install_id, sent_at, ... }
 *
 * One signal per request, about 5 minutes after start and then every 24 hours.
 * Totals are snapshots, and the lifetime ones only grow, so activity is the
 * difference between an install's consecutive signals. Nothing here identifies
 * a person or a community: the install id is a random ULID the instance makes
 * up once, and everything else is versions, settings and counts.
 *
 * fuwa may add fields within v1 (anything breaking becomes fuwa.signal.v2).
 * Fields this ingest doesn't know yet are kept in each row's raw JSON.
 */
import { Schema } from "effect";

/**
 * Largest request body the ingest reads. A signal is well under 1 KB, so this
 * leaves room for fields a newer fuwa adds (kept in raw) while bounding them.
 */
export const MAX_BODY_BYTES = 8 * 1024;

/** A counter: a whole number, zero or more. */
const Count = Schema.NonNegativeInt;
/** A short label such as a version, an OS or a setting. */
const Label = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64));

export const Signal = Schema.Struct({
  schema: Schema.Literal("fuwa.signal.v1"),
  /** Random, made once per instance; never derived from a host, address or person. */
  install_id: Schema.String.pipe(Schema.pattern(/^[0-9A-HJKMNP-TV-Z]{26}$/, { message: () => "Expected a ULID" })),
  /** When the instance sent it, in Unix milliseconds. */
  sent_at: Count,
  /** Our hosted instance or someone's own. Builds from before this field count as self-hosted. */
  hosting: Schema.optionalWith(Schema.Literal("self_hosted", "hosted"), { default: () => "self_hosted" as const }),
  version: Label,
  os: Label,
  arch: Label,
  uptime_seconds: Count,
  config: Schema.Struct({
    /** "open", "closed" or "off". */
    local_accounts: Label,
    linked_accounts: Schema.Boolean,
    /** "everyone", "admins" or "off". */
    server_creation: Label,
    encryption: Schema.Boolean,
    /** Whether the operator set any usage limits. */
    limits_configured: Schema.Boolean,
  }),
  totals: Schema.Struct({
    /** Every account, agents included. */
    accounts: Count,
    /** Accounts that are agents (bots and apps). Builds from before agents leave it out. */
    agents: Schema.optional(Count),
    accounts_active_1d: Count,
    accounts_active_30d: Count,
    servers: Count,
    discoverable_servers: Count,
    members: Count,
    channels: Count,
    /** Currently stored. */
    messages: Count,
    /** Lifetime. */
    messages_sent: Count,
    message_bytes: Count,
    attachments: Count,
    attachment_bytes: Count,
    /** Lifetime. */
    events: Count,
    /** Every server database file on disk. */
    storage_bytes: Count,
  }),
  // Fields a newer fuwa adds pass through, so they land in the raw JSON.
}).annotations({ parseOptions: { onExcessProperty: "preserve" } });
export type Signal = typeof Signal.Type;
