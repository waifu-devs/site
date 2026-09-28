// Applies migrations/*.sql in order to the Postgres database at DATABASE_URL,
// recording each in a schema_migrations table so it only runs once.
//
//   DATABASE_URL=postgres://... pnpm db:migrate
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to the Postgres connection string first.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const applied = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));
  const files = (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(`migrations/${file}`, "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log("database is up to date");
} finally {
  await sql.end();
}
