import { DuckDBInstance, type DuckDBConnection, type DuckDBValue } from "@duckdb/node-api";
import { Config, Data, Effect, Option, Redacted } from "effect";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export class LakeError extends Data.TaggedError("LakeError")<{ readonly cause: unknown }> {
  override get message() {
    return this.cause instanceof Error ? this.cause.message : String(this.cause);
  }
}

/** A value for a SQL string literal, for the statements DuckDB can't bind parameters in. */
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Where the lake lives. In production the DuckLake catalog is a schema in the
 * site's Postgres and the Parquet files go to the Railway bucket; without
 * DATABASE_URL and S3_BUCKET (local development, tests) both are local files.
 */
export const LakeConfig = Config.all({
  databaseUrl: Config.option(Config.redacted("DATABASE_URL")),
  /** The Postgres schema holding DuckLake's catalog tables, away from the api's own. */
  metadataSchema: Config.string("LAKE_METADATA_SCHEMA").pipe(Config.withDefault("ducklake")),
  bucket: Config.option(Config.string("S3_BUCKET")),
  /** Where in the bucket the Parquet files go. */
  prefix: Config.string("LAKE_PREFIX").pipe(Config.withDefault("lake")),
  endpoint: Config.string("S3_ENDPOINT").pipe(Config.withDefault("https://t3.storageapi.dev")),
  region: Config.string("S3_REGION").pipe(Config.withDefault("auto")),
  forcePathStyle: Config.boolean("S3_FORCE_PATH_STYLE").pipe(Config.withDefault(false)),
  accessKeyId: Config.string("S3_ACCESS_KEY_ID").pipe(Config.withDefault("")),
  secretAccessKey: Config.redacted("S3_SECRET_ACCESS_KEY").pipe(Config.withDefault(Redacted.make(""))),
  /** Local stand-ins for the catalog and the bucket. */
  localDirectory: Config.string("LAKE_LOCAL_DIRECTORY").pipe(Config.withDefault(".lake")),
  /** Prebuilt at build time by scripts/install-extensions.mjs. */
  extensionDirectory: Config.string("DUCKDB_EXTENSION_DIRECTORY").pipe(
    Config.withDefault(fileURLToPath(new URL("../.duckdb/extensions", import.meta.url))),
  ),
  memoryLimit: Config.string("DUCKDB_MEMORY_LIMIT").pipe(Config.withDefault("512MB")),
  threads: Config.integer("DUCKDB_THREADS").pipe(Config.withDefault(2)),
});
export type LakeConfig = Config.Config.Success<typeof LakeConfig>;

/** The statements that load the extensions and attach the lake as `lake`. */
export const attachStatements = (config: LakeConfig, options: { readOnly: boolean }): string[] => {
  const statements = ["SET TimeZone = 'UTC'", "INSTALL ducklake", "LOAD ducklake"];

  let catalog: string;
  const attachOptions: string[] = [];
  if (Option.isSome(config.databaseUrl)) {
    statements.push("INSTALL postgres", "LOAD postgres");
    catalog = `ducklake:postgres:${Redacted.value(config.databaseUrl.value)}`;
    attachOptions.push(`METADATA_SCHEMA ${literal(config.metadataSchema)}`);
  } else {
    mkdirSync(config.localDirectory, { recursive: true });
    catalog = `ducklake:${config.localDirectory}/catalog.ducklake`;
  }

  if (Option.isSome(config.bucket)) {
    const endpoint = new URL(config.endpoint);
    statements.push(
      "INSTALL httpfs",
      "LOAD httpfs",
      `CREATE OR REPLACE SECRET lake_bucket (${[
        "TYPE s3",
        `KEY_ID ${literal(config.accessKeyId)}`,
        `SECRET ${literal(Redacted.value(config.secretAccessKey))}`,
        `REGION ${literal(config.region)}`,
        `ENDPOINT ${literal(endpoint.host)}`,
        `USE_SSL ${endpoint.protocol === "https:"}`,
        `URL_STYLE ${literal(config.forcePathStyle ? "path" : "vhost")}`,
        `SCOPE ${literal(`s3://${config.bucket.value}`)}`,
      ].join(", ")})`,
    );
    attachOptions.push(`DATA_PATH ${literal(`s3://${config.bucket.value}/${config.prefix}/`)}`);
  } else {
    attachOptions.push(`DATA_PATH ${literal(`${config.localDirectory}/data/`)}`);
  }

  if (options.readOnly) attachOptions.push("READ_ONLY");
  statements.push(`ATTACH IF NOT EXISTS ${literal(catalog)} AS lake (${attachOptions.join(", ")})`);
  return statements;
};

const passwordOf = (url: Redacted.Redacted) => {
  try {
    return new URL(Redacted.value(url)).password;
  } catch {
    return "";
  }
};

export interface Rows extends ReadonlyArray<Record<string, unknown>> {}

/**
 * An in-process DuckDB with the DuckLake attached as `lake`. One connection,
 * used one statement at a time.
 */
export const makeLake = (options: { readOnly: boolean }) =>
  Effect.gen(function* () {
    const config = yield* LakeConfig;
    const instance = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          DuckDBInstance.create(":memory:", {
            extension_directory: config.extensionDirectory,
            memory_limit: config.memoryLimit,
            threads: String(config.threads),
          }),
        catch: (cause) => new LakeError({ cause }),
      }),
      (instance) => Effect.sync(() => instance.closeSync()),
    );
    const connection: DuckDBConnection = yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => instance.connect(), catch: (cause) => new LakeError({ cause }) }),
      (connection) => Effect.sync(() => connection.closeSync()),
    );
    const lock = yield* Effect.makeSemaphore(1);

    // DuckDB can't be interrupted halfway through a statement, so a statement
    // always runs to the end before its fiber stops.
    const use = <A>(f: (connection: DuckDBConnection) => Promise<A>) =>
      lock.withPermits(1)(Effect.tryPromise({ try: () => f(connection), catch: (cause) => new LakeError({ cause }) })).pipe(
        Effect.uninterruptible,
      );

    const run = (sql: string, values?: DuckDBValue[]) => use((connection) => connection.run(sql, values)).pipe(Effect.asVoid);
    /** Rows as JSON-safe values (BIGINTs and timestamps come back as strings). */
    const query = (sql: string, values?: DuckDBValue[]) =>
      use(async (connection) => (await connection.runAndReadAll(sql, values)).getRowObjectsJson() as Rows);
    /** Runs the statements as one transaction, so they land as one lake snapshot or not at all. */
    const transaction = (statements: ReadonlyArray<readonly [sql: string, values?: DuckDBValue[]]>) =>
      use(async (connection) => {
        await connection.run("BEGIN TRANSACTION");
        try {
          for (const [sql, values] of statements) await connection.run(sql, values);
          await connection.run("COMMIT");
        } catch (error) {
          await connection.run("ROLLBACK").catch(() => undefined);
          throw error;
        }
      });

    // These statements carry the database password and the bucket key, and a
    // DuckDB error can quote the statement, so errors are scrubbed of both.
    const secrets = [Option.getOrElse(Option.map(config.databaseUrl, passwordOf), () => ""), Redacted.value(config.secretAccessKey)].filter(
      (secret) => secret.length > 0,
    );
    const scrub = (error: LakeError) =>
      new LakeError({ cause: new Error(secrets.reduce((message, secret) => message.replaceAll(secret, "***"), error.message)) });
    for (const statement of attachStatements(config, options)) yield* run(statement).pipe(Effect.mapError(scrub));
    return { run, query, transaction } as const;
  });

export class Lake extends Effect.Service<Lake>()("Lake", {
  scoped: makeLake({ readOnly: false }),
}) {}
