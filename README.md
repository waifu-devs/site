# Waifu Devs community site (✿◕‿◕✿)

The community site for Waifu Devs: GitHub sign-in, member profiles, and custom themes that restyle the whole site.

Built with [vinext](https://github.com/cloudflare/vinext) (the Next.js App Router API on Vite) and deployed to Cloudflare Workers, with Cloudflare D1 for data.

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
| `lib/db.ts` | D1 queries |
| `lib/session.ts` | Cookie sessions (tokens are stored hashed in D1) |
| `lib/actions.ts` | Server actions: edit profile, create/wear/delete themes, sign out |
| `lib/themes.ts` | Theme palette shape, built-in themes, validation |
| `migrations/` | D1 schema migrations |
| `cloudflare.config.ts` | Worker config and bindings (`DB`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) |

A theme is seven colors exposed as CSS variables (`--theme-bg`, `--theme-accent`, …) and mapped to Tailwind colors (`bg-bg`, `bg-surface`, `text-ink`, `text-muted`, `bg-accent`, `text-on-accent`, `border-line`) in `app/globals.css`. Use those classes instead of fixed colors so every theme works.

## Local development

1. Create a GitHub OAuth app for development at <https://github.com/settings/developers> with
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:5173/api/auth/callback`
2. `cp .dev.vars.example .dev.vars` and fill in its client ID and secret.
3. Install and run:

   ```sh
   pnpm install
   pnpm dev                 # http://localhost:5173
   pnpm db:migrate:local    # in another terminal, while dev is running
   ```

`pnpm typecheck` generates Worker types and runs `tsc`.

## Deploying to Cloudflare

One-time setup:

1. Log in: `pnpm exec cf auth login` (or set `CLOUDFLARE_API_TOKEN`), and set `CLOUDFLARE_ACCOUNT_ID` or `accountId` in `cloudflare.config.ts`.
2. Create the database: `pnpm exec cf d1 create --name waifu-devs-site`, then put the returned `id` on the `DB` binding in `cloudflare.config.ts`.
3. Apply migrations: `D1_DATABASE_ID=<id> pnpm db:migrate:remote`.
4. Create a production GitHub OAuth app with callback URL `https://<your-domain>/api/auth/callback`.
5. Deploy once with `pnpm deploy`, then add the secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to the `waifu-devs-site` Worker (Dashboard → Workers & Pages → waifu-devs-site → Settings → Variables and Secrets).

After that, `pnpm deploy` builds and ships. New schema changes go in a new `migrations/000N_*.sql` file and are applied with `pnpm db:migrate:remote` before deploying code that needs them.
