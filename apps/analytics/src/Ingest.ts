import { Config, Data, Duration, Effect, Ref, Schedule } from "effect";
import { Lake } from "./Lake.ts";
import type { Signal } from "./Signals.ts";
import { append, type SignalRow, toRow } from "./Tables.ts";

/** The buffer is full (INGEST_MAX_PENDING_BYTES): the lake has been unreachable for a while. Senders retry later. */
export class IngestFull extends Data.TaggedError("IngestFull") {}

/** Signals waiting for the next flush, and roughly how much memory they take. */
type Pending = { readonly rows: ReadonlyArray<SignalRow>; readonly bytes: number };
const EMPTY: Pending = { rows: [], bytes: 0 };

/** A row's size as JSON: about what it holds in memory, and what it adds to the flush. */
const sizeOf = (row: SignalRow) => Buffer.byteLength(JSON.stringify(row));

/**
 * Accepted signals wait in memory and are written to the lake together every
 * few seconds, so the lake gets one snapshot per flush instead of one per
 * request. If a write fails the rows stay queued for the next flush, and the
 * last flush runs on shutdown.
 */
export class Ingest extends Effect.Service<Ingest>()("Ingest", {
  scoped: Effect.gen(function* () {
    const every = yield* Config.duration("INGEST_FLUSH_INTERVAL").pipe(Config.withDefault(Duration.seconds(30)));
    // Bounded by size rather than count: fields a newer fuwa adds make rows bigger.
    const limit = yield* Config.integer("INGEST_MAX_PENDING_BYTES").pipe(Config.withDefault(64 * 1024 * 1024));
    const lake = yield* Lake;
    const pending = yield* Ref.make<Pending>(EMPTY);

    const add = (signal: Signal, receivedAt: Date) =>
      Ref.modify(pending, (current): [boolean, Pending] => {
        const row = toRow(signal, receivedAt);
        const bytes = current.bytes + sizeOf(row);
        return bytes > limit ? [false, current] : [true, { rows: [...current.rows, row], bytes }];
      }).pipe(Effect.flatMap((added) => (added ? Effect.void : Effect.fail(new IngestFull()))));

    const flush = Effect.gen(function* () {
      const taken = yield* Ref.getAndSet(pending, EMPTY);
      if (taken.rows.length === 0) return 0;
      yield* append(taken.rows).pipe(
        Effect.provideService(Lake, lake),
        // Put them back in front of whatever arrived meanwhile.
        Effect.tapError(() =>
          Ref.update(pending, (current) => ({ rows: [...taken.rows, ...current.rows], bytes: taken.bytes + current.bytes })),
        ),
      );
      return taken.rows.length;
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
