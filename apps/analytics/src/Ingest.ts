import { Config, Data, Duration, Effect, Ref, Schedule } from "effect";
import { Lake } from "./Lake.ts";
import type { Batch } from "./Signals.ts";
import { append, type EventRow, type HeartbeatRow, toRows } from "./Tables.ts";

/** The buffer is full: the lake has been unreachable for a while. Senders retry later. */
export class IngestFull extends Data.TaggedError("IngestFull") {}

interface Pending {
  readonly heartbeats: ReadonlyArray<HeartbeatRow>;
  readonly events: ReadonlyArray<EventRow>;
}
const empty: Pending = { heartbeats: [], events: [] };
const size = (pending: Pending) => pending.heartbeats.length + pending.events.length;

/**
 * Accepted events wait in memory and are written to the lake together every
 * few seconds, so the lake gets one snapshot per flush instead of one per
 * request. If a write fails the rows stay queued for the next flush, and the
 * last flush runs on shutdown.
 */
export class Ingest extends Effect.Service<Ingest>()("Ingest", {
  scoped: Effect.gen(function* () {
    const every = yield* Config.duration("INGEST_FLUSH_INTERVAL").pipe(Config.withDefault(Duration.seconds(30)));
    const limit = yield* Config.integer("INGEST_MAX_PENDING").pipe(Config.withDefault(50_000));
    const lake = yield* Lake;
    const pending = yield* Ref.make(empty);

    const add = (batch: Batch, receivedAt: Date) =>
      Ref.modify(pending, (current): [boolean, Pending] => {
        if (size(current) + batch.events.length > limit) return [false, current];
        const rows = toRows(batch, receivedAt);
        return [
          true,
          { heartbeats: [...current.heartbeats, ...rows.heartbeats], events: [...current.events, ...rows.events] },
        ];
      }).pipe(Effect.flatMap((added) => (added ? Effect.succeed(batch.events.length) : Effect.fail(new IngestFull()))));

    const flush = Effect.gen(function* () {
      const rows = yield* Ref.getAndSet(pending, empty);
      if (size(rows) === 0) return 0;
      yield* append(rows).pipe(
        Effect.provideService(Lake, lake),
        // Put them back in front of whatever arrived meanwhile.
        Effect.tapError(() =>
          Ref.update(pending, (current) => ({
            heartbeats: [...rows.heartbeats, ...current.heartbeats],
            events: [...rows.events, ...current.events],
          })),
        ),
      );
      return size(rows);
    }).pipe(
      Effect.tap((written) => (written > 0 ? Effect.logInfo(`Wrote ${written} events to the lake`) : Effect.void)),
      Effect.uninterruptible,
    );

    yield* flush.pipe(
      Effect.catchAll((error) => Effect.logWarning("Writing to the lake failed; keeping the events for the next try", error)),
      Effect.repeat(Schedule.spaced(every)),
      Effect.forkScoped,
    );
    yield* Effect.addFinalizer(() => flush.pipe(Effect.catchAll((error) => Effect.logError("Lost events on shutdown", error))));

    return { add, flush, pending: Ref.get(pending).pipe(Effect.map(size)) } as const;
  }),
}) {}
