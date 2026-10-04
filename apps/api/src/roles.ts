/**
 * Database roles for the services that shouldn't hold the owner's login. Runs
 * after the migrations on every api deploy (railway.ts preDeploy) and is safe
 * to run again: it only ever ends in the state described here.
 *
 * `status_checks` is the status service (apps/status): it can read and write
 * the three status_* tables and nothing else. It signs in with
 * STATUS_DB_PASSWORD (a shared variable); while that's unset it can't sign in
 * at all. The password goes to Postgres as a SCRAM verifier, never as itself,
 * so it can't end up in Postgres's logs (Railway's logs are public).
 *
 * Failures are told in fixed words: database errors name internal hosts.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import pg from "pg";

const ROLE = "status_checks";
const TABLES = ["status_days", "status_components", "status_incidents"];

/** What Postgres stores for a SCRAM-SHA-256 password (RFC 5802/7677). */
export function scramVerifier(password: string, salt = randomBytes(16), iterations = 4096): string {
  const salted = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const password = process.env.STATUS_DB_PASSWORD ?? "";
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') THEN CREATE ROLE ${ROLE} NOLOGIN; END IF;
    END $$`);
    const { rows } = await client.query<{ db: string }>("SELECT current_database() AS db");
    await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(rows[0]!.db)} TO ${ROLE}`);
    // Postgres before 15 lets every role create tables in public; nobody but the owner should.
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
    for (const table of TABLES) {
      await client.query(`REVOKE ALL ON ${table} FROM ${ROLE}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO ${ROLE}`);
    }
    // At most a few connections, and never more than a minute on one statement.
    await client.query(`ALTER ROLE ${ROLE} CONNECTION LIMIT 8`);
    await client.query(`ALTER ROLE ${ROLE} SET statement_timeout = '60s'`);
    if (password.length >= 24) {
      await client.query(`ALTER ROLE ${ROLE} LOGIN PASSWORD ${client.escapeLiteral(scramVerifier(password))}`);
    } else {
      await client.query(`ALTER ROLE ${ROLE} NOLOGIN`);
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ message: `Roles set; ${ROLE} ${password.length >= 24 ? "can" : "can't"} sign in` }));
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    console.error(JSON.stringify({ message: "Setting database roles failed" }));
    process.exit(1);
  });
}
