import { Config, Data, Duration, Effect, Ref, Schedule } from "effect";
import { Lake } from "./Lake.ts";
import type { Signal } from "./Signals.ts";
import { append, type SignalRow, toRow } from "./Tables.ts";

/** The buffer is full: the lake has been unreachable for a while. Senders retry later. */
export class IngestFull extends Data.TaggedError("IngestFull") {}

/**
 * Accepted signals wait in memory and are written to the lake together every
 * few seconds, so the lake gets one snapshot per flush instead of one per
 * request. If a write fails the rows stay queued for the next flush, and the
 * last flush runs on shutdown.
 */
export class Ingest extends Effect.Service<Ingest>()("Ingest", {
  scoped: Effect.gen(function* () {
    const every = yield* Config.duration("INGEST_FLUSH_INTERVAL").pipe(Config.withDefault(Duration.seconds(30)));
    const limit = yield* Config.integer("INGEST_MAX_PENDING").pipe(Config.withDefault(50_000));
    const lake = yield* Lake;
    const pending = yield* Ref.make<ReadonlyArray<SignalRow>>([]);

    const add = (signal: Signal, receivedAt: Date) =>
      Ref.modify(pending, (rows): [boolean, ReadonlyArray<SignalRow>] =>
        rows.length >= limit ? [false, rows] : [true, [...rows, toRow(signal, receivedAt)]],
      ).pipe(Effect.flatMap((added) => (added ? Effect.void : Effect.fail(new IngestFull()))));

    const flush = Effect.gen(function* () {
      const rows = yield* Ref.getAndSet(pending, []);
      if (rows.length === 0) return 0;
      yield* append(rows).pipe(
        Effect.provideService(Lake, lake),
        // Put them back in front of whatever arrived meanwhile.
        Effect.tapError(() => Ref.update(pending, (current) => [...rows, ...current])),
      );
      return rows.length;
    }).pipe(
      Effect.tap((written) => (written > 0 ? Effect.logInfo(`Wrote ${written} signals to the lake`) : Effect.void)),
      Effect.uninterruptible,
    );

    yield* flush.pipe(
      Effect.catchAll((error) => Effect.logWarning("Writing to the lake failed; keeping the signals for the next try", error)),
      Effect.repeat(Schedule.spaced(every)),
      Effect.forkScoped,
    );
    yield* Effect.addFinalizer(() => flush.pipe(Effect.catchAll((error) => Effect.logError("Lost signals on shutdown", error))));

    return { add, flush } as const;
  }),
}) {}
