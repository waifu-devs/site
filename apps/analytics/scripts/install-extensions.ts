// Downloads the DuckDB extensions the service loads (DuckLake, Postgres for its
// catalog, httpfs for the bucket) into .duckdb/extensions at build time, so a
// deploy never depends on extensions.duckdb.org being reachable at startup.
import { DuckDBInstance } from "@duckdb/node-api";
import { fileURLToPath } from "node:url";

const directory = process.env.DUCKDB_EXTENSION_DIRECTORY ?? fileURLToPath(new URL("../.duckdb/extensions", import.meta.url));
const instance = await DuckDBInstance.create(":memory:", { extension_directory: directory });
const connection = await instance.connect();
for (const extension of ["ducklake", "postgres", "httpfs"]) {
  await connection.run(`INSTALL ${extension}`);
}
connection.closeSync();
instance.closeSync();
console.log(`DuckDB extensions ready in ${directory}`);
