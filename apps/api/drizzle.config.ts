import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` writes a migration from src/schema.ts;
// `DATABASE_URL=... pnpm db:migrate` applies pending ones.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
