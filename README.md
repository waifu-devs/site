# Waifu Devs community site (✿◕‿◕✿)

The community site for Waifu Devs: GitHub sign-in, member profiles, and custom themes that restyle the whole site.

Built with [vinext](https://github.com/cloudflare/vinext) (the Next.js App Router API on Vite) and deployed to Cloudflare Workers, with PlanetScale Postgres for data (reached through Cloudflare Hyperdrive using [postgres.js](https://github.com/porsager/postgres)).

## What's here

- **Accounts** via GitHub only (`/login`), through [OpenAuth](https://openauth.js.org). Your GitHub login and avatar refresh every time you sign in.
- **Profiles** at `/u/<github-login>` with display name, pronouns, favorite waifu, website and bio. Edit at `/settings`.
- **Themes**: five built-ins (Sakura, Yoru, Matcha, Sora, Tsundere) plus community themes made in the live editor at `/themes/new`. The theme you wear styles the site for you, and your profile for everyone who visits it. Themes can be public or private.
- **Members** directory at `/members`.

## Layout

| Path | What |
| --- | --- |
| `app/` | Pages, layout, and the sign-in route handlers (`app/api/auth/login`, `app/api/auth/callback`) |
| `components/` | Shared UI, including the client-side `ThemeEditor`; `components/ui/` holds the shadcn/ui components |
| `lib/db.ts` | Postgres queries (one postgres.js client per request, over Hyperdrive) |
| `proxy.ts` | Serves the OpenAuth issuer's routes and refreshes expired access tokens before pages render |
| `lib/auth/` | OpenAuth issuer (GitHub provider), its Postgres storage, and the in-Worker client |
| `lib/session.ts` | `currentUser()` / `requireUser()`: verifies the access token cookie |
| `lib/actions.ts` | Server actions: edit profile, create/wear/delete themes, sign out |
| `lib/themes.ts` | Theme variants: shadcn token list, built-in themes, seed derivation, validation |
| `migrations/` | Postgres schema migrations, applied by `pnpm db:migrate` |
| `cloudflare.config.ts` | Worker config and bindings (`HYPERDRIVE`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) |

UI components are [shadcn/ui](https://ui.shadcn.com) (in `components/ui/`, added by hand because the shadcn registry isn't reachable from every environment; `components.json` is set up if you want to use `pnpm dlx shadcn add` locally). **Themes are shadcn theme variants**: every theme, built-in or member-made, is a full set of values for the shadcn tokens (`--background`, `--primary`, `--muted-foreground`, …, plus `--radius`), stored as `{ tokens, radius }`. The layout applies the viewer's variant to `<html>`, and profile pages apply the owner's. The theme editor has a Quick tab (7 seed colors that derive the rest) and an All tokens tab for fine-tuning. Stick to shadcn token classes (`bg-card`, `text-muted-foreground`, `bg-primary`, …) instead of fixed colors so every theme works.

## How sign-in works

[OpenAuth](https://openauth.js.org) runs inside this same Worker. Its issuer serves `/authorize`, `/token`, `/github/*` and `/.well-known/*` at the site root (OpenAuth hardcodes those paths, so it can't sit under a prefix like `/auth`); `proxy.ts` hands those requests to it. The site is its only client (`waifu-devs-site`), and the client talks to the issuer in-process rather than over the network.

1. `/api/auth/login` starts an OpenAuth authorization-code flow with PKCE and sends you to GitHub.
2. GitHub returns to `/github/callback`. The issuer reads your GitHub profile, creates or updates your `users` row, and redirects to `/api/auth/callback` with a code.
3. The callback trades the code for an access token (1 hour) and a refresh token (1 year), stored in `HttpOnly` cookies.
4. `proxy.ts` refreshes an expired access token before the page renders. Signing out deletes the refresh token.

OpenAuth's own storage (signing keys, codes, refresh tokens) lives in the `openauth_storage` table, so no KV namespace is needed.

## Local development

You need a Postgres database: a local one (`postgres://postgres:postgres@localhost:5432/waifu`), or a PlanetScale development branch.

1. Create a GitHub OAuth app for development at <https://github.com/settings/developers> with
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:5173/github/callback`
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
5. Create a production GitHub OAuth app with callback URL `https://<your-domain>/github/callback`.
6. Put the Hyperdrive id on the `HYPERDRIVE` binding in `cloudflare.config.ts` (already set for our config). Deploy once with `pnpm deploy`, then add the secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to the `waifu-devs-site` Worker (Dashboard → Workers & Pages → waifu-devs-site → Settings → Variables and Secrets).

After that, `pnpm deploy` builds and ships. Schema changes go in a new `migrations/000N_*.sql` file and are applied with `pnpm db:migrate` before deploying code that needs them.
