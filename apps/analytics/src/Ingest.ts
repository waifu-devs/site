import { Config, Data, Duration, Effect, Ref, Schedule } from "effect";
import { Lake } from "./Lake.ts";
import type { Report } from "./Reports.ts";
import type { Signal } from "./Signals.ts";
import { append, type Batch, reportRows, type Row, type Table, toRow } from "./Tables.ts";

/** The buffer is full (INGEST_MAX_PENDING_BYTES): the lake has been unreachable for a while. Senders retry later. */
export class IngestFull extends Data.TaggedError("IngestFull") {}

/** Rows waiting for the next flush, by table, and roughly how much memory they take. */
type Pending = { readonly batch: Batch; readonly rows: number; readonly bytes: number };
const EMPTY: Pending = { batch: {}, rows: 0, bytes: 0 };

/** Rows' size as JSON: about what they hold in memory, and what they add to the flush. */
const sizeOf = (batch: Batch) => Buffer.byteLength(JSON.stringify(batch));
const countOf = (batch: Batch) => Object.values(batch).reduce((n, rows) => n + (rows?.length ?? 0), 0);

/** `later`'s rows after `earlier`'s, table by table. */
const merge = (earlier: Batch, later: Batch): Batch => {
  const merged: { [T in Table]?: ReadonlyArray<Row> } = { ...earlier };
  for (const [table, rows] of Object.entries(later) as Array<[Table, ReadonlyArray<Row>]>) {
    merged[table] = [...(merged[table] ?? []), ...rows];
  }
  return merged;
};

/**
 * Accepted signals and reports wait in memory and are written to the lake
 * together every few seconds, so the lake gets one snapshot per flush instead
 * of one per request. If a write fails the rows stay queued for the next
 * flush, and the last flush runs on shutdown.
 */
export class Ingest extends Effect.Service<Ingest>()("Ingest", {
  scoped: Effect.gen(function* () {
    const every = yield* Config.duration("INGEST_FLUSH_INTERVAL").pipe(Config.withDefault(Duration.seconds(30)));
    // Bounded by size rather than count: fields a newer sender adds make rows bigger.
    const limit = yield* Config.integer("INGEST_MAX_PENDING_BYTES").pipe(Config.withDefault(64 * 1024 * 1024));
    const lake = yield* Lake;
    const pending = yield* Ref.make<Pending>(EMPTY);

    const addBatch = (batch: Batch) =>
      Ref.modify(pending, (current): [boolean, Pending] => {
        const bytes = current.bytes + sizeOf(batch);
        return bytes > limit ? [false, current] : [true, { batch: merge(current.batch, batch), rows: current.rows + countOf(batch), bytes }];
      }).pipe(Effect.flatMap((added) => (added ? Effect.void : Effect.fail(new IngestFull()))));

    const add = (signal: Signal, receivedAt: Date) => addBatch({ "fuwa.signals": [toRow(signal, receivedAt)] });
    const addReport = (report: Report, receivedAt: Date) => addBatch(reportRows(report, receivedAt));

    const flush = Effect.gen(function* () {
      const taken = yield* Ref.getAndSet(pending, EMPTY);
      if (taken.rows === 0) return 0;
      yield* append(taken.batch).pipe(
        Effect.provideService(Lake, lake),
        // Put them back in front of whatever arrived meanwhile.
        Effect.tapError(() =>
          Ref.update(pending, (current) => ({
            batch: merge(taken.batch, current.batch),
            rows: taken.rows + current.rows,
            bytes: taken.bytes + current.bytes,
          })),
        ),
      );
      return taken.rows;
    }).pipe(
      Effect.tap((written) => (written > 0 ? Effect.logInfo(`Wrote ${written} rows to the lake`) : Effect.void)),
      Effect.uninterruptible,
    );

    yield* flush.pipe(
      Effect.catchAll((error) => Effect.logWarning("Writing to the lake failed; keeping the rows for the next try", error)),
      Effect.repeat(Schedule.spaced(every)),
      Effect.forkScoped,
    );
    yield* Effect.addFinalizer(() => flush.pipe(Effect.catchAll((error) => Effect.logError("Lost rows on shutdown", error))));

    return { add, addReport, flush } as const;
  }),
}) {}
