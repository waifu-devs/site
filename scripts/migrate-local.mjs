// Applies migrations/*.sql to the local D1 database of a running `pnpm dev` server.
//
// `cf d1 migrations apply --local` wants a real database ID, which the local
// simulation doesn't have, so this goes through the dev server's Local Explorer
// API instead. It keeps the same `d1_migrations` bookkeeping table as
// `cf d1 migrations apply`, so already-applied files are skipped.
import { readdir, readFile } from "node:fs/promises";

const origin = process.env.DEV_ORIGIN ?? "http://localhost:5173";
const api = `${origin}/cdn-cgi/local/explorer/api/d1/database`;

async function raw(uuid, sql, params = []) {
  const res = await fetch(`${api}/${uuid}/raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const body = await res.json();
  if (!body.success) throw new Error(JSON.stringify(body.errors));
  return body.result.at(-1).results.rows;
}

let databases;
try {
  databases = (await (await fetch(api)).json()).result;
} catch {
  console.error(`Couldn't reach ${origin}. Start the dev server with \`pnpm dev\` first.`);
  process.exit(1);
}
const db = databases.find((d) => d.name === "DB");
if (!db) throw new Error("No D1 binding named DB in the running dev server.");

await raw(
  db.uuid,
  "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
);
const applied = new Set((await raw(db.uuid, "SELECT name FROM d1_migrations")).map((r) => r[0]));
const files = (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  if (applied.has(file)) continue;
  const sql = await readFile(`migrations/${file}`, "utf8");
  // One request, so the migration and its bookkeeping row land together.
  await raw(db.uuid, `${sql}\n;INSERT INTO d1_migrations (name) VALUES ('${file.replaceAll("'", "''")}');`);
  console.log(`applied ${file}`);
}
console.log("local database is up to date");
