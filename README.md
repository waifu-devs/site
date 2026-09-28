# Waifu Devs community site (✿◕‿◕✿)

The community site for Waifu Devs: GitHub sign-in, member profiles, and custom themes that restyle the whole site.

Built with [vinext](https://github.com/cloudflare/vinext) (the Next.js App Router API on Vite) and deployed to Cloudflare Workers, with PlanetScale Postgres for data (reached through Cloudflare Hyperdrive using [postgres.js](https://github.com/porsager/postgres)).

## What's here

- **Accounts** via GitHub OAuth only (`/login`). Your GitHub login and avatar refresh every time you sign in.
- **Profiles** at `/u/<github-login>` with display name, pronouns, favorite waifu, website and bio. Edit at `/settings`.
- **Themes**: five built-ins (Sakura, Yoru, Matcha, Sora, Tsundere) plus community themes made in the live editor at `/themes/new`. The theme you wear styles the site for you, and your profile for everyone who visits it. Themes can be public or private.
- **Members** directory at `/members`.

## Layout

| Path | What |
| --- | --- |
| `app/` | Pages, layout, and the GitHub OAuth route handlers (`app/api/auth/*`) |
| `components/` | Shared UI, including the client-side `ThemeEditor` |
| `lib/db.ts` | Postgres queries (one postgres.js client per request, over Hyperdrive) |
| `lib/session.ts` | Cookie sessions (tokens are stored hashed in Postgres) |
| `lib/actions.ts` | Server actions: edit profile, create/wear/delete themes, sign out |
| `lib/themes.ts` | Theme palette shape, built-in themes, validation |
| `migrations/` | Postgres schema migrations, applied by `pnpm db:migrate` |
| `cloudflare.config.ts` | Worker config and bindings (`HYPERDRIVE`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) |

A theme is seven colors exposed as CSS variables (`--theme-bg`, `--theme-accent`, …) and mapped to Tailwind colors (`bg-bg`, `bg-surface`, `text-ink`, `text-muted`, `bg-accent`, `text-on-accent`, `border-line`) in `app/globals.css`. Use those classes instead of fixed colors so every theme works.

## Local development

You need a Postgres database: a local one (`postgres://postgres:postgres@localhost:5432/waifu`), or a PlanetScale development branch.

1. Create a GitHub OAuth app for development at <https://github.com/settings/developers> with
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:5173/api/auth/callback`
2. `cp .dev.vars.example .dev.vars` and fill in its client ID and secret.
3. Install, migrate and run:

   ```sh
   pnpm install
   export DATABASE_URL=postgres://postgres:postgres@localhost:5432/waifu
   pnpm db:migrate
   pnpm dev                 # http://localhost:5173
   ```

In dev, the `HYPERDRIVE` binding connects straight to `DATABASE_URL` (see `cloudflare.config.ts`). `pnpm typecheck` generates Worker types and runs `tsc`.

## Deploying to Cloudflare

One-time setup:

1. Log in: `pnpm exec cf auth login` (or set `CLOUDFLARE_API_TOKEN`), and set `CLOUDFLARE_ACCOUNT_ID` or `accountId` in `cloudflare.config.ts`.
2. In PlanetScale, create the Postgres database and a role for the app, and copy its connection string.
3. Create the schema: `DATABASE_URL=<planetscale connection string> pnpm db:migrate`.
4. Create a Hyperdrive config pointing at PlanetScale, in the dashboard (Workers & Pages → Hyperdrive → Create) or with `cf hyperdrive create`. The connection string lives inside Hyperdrive, so the Worker never holds the database password. Copy the Hyperdrive id.

   We run on PlanetScale's smallest ($5) Postgres instance, which allows only a handful of connections. Hyperdrive is what keeps us inside that: every Worker request shares its pool instead of opening its own database connection. When creating the config, set its maximum origin connections well below the instance's limit (check with `SHOW max_connections;`, and leave room for migrations and your own psql sessions). If PlanetScale offers a PgBouncer connection string for the database, give that one to Hyperdrive.
5. Create a production GitHub OAuth app with callback URL `https://<your-domain>/api/auth/callback`.
6. Paste the Hyperdrive id over `PASTE_HYPERDRIVE_ID_HERE` in `cloudflare.config.ts`. Deploy once with `pnpm deploy`, then add the secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to the `waifu-devs-site` Worker (Dashboard → Workers & Pages → waifu-devs-site → Settings → Variables and Secrets).

After that, `pnpm deploy` builds and ships. Schema changes go in a new `migrations/000N_*.sql` file and are applied with `pnpm db:migrate` before deploying code that needs them.
