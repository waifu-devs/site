# Waifu Devs community site (✿◕‿◕✿)

The community site for Waifu Devs: GitHub sign-in, member profiles, custom themes that restyle the whole site, and a Hacker News style news board.

It's a pnpm monorepo with a separate API and web app, both written with [Effect](https://effect.website), hosted on [Railway](https://railway.com) and described as code in [`.railway/railway.ts`](.railway/railway.ts).

| Path | What |
| --- | --- |
| `apps/api` | The API: an Effect `HttpApi` server on Node, Drizzle on Postgres, and the [OpenAuth](https://openauth.js.org) issuer for GitHub sign-in |
| `apps/analytics` | Anonymous usage signals from fuwa servers, stored in a [DuckLake](https://ducklake.select) with DuckDB (see [Analytics](#analytics)) |
| `apps/web` | The site: [TanStack Start](https://tanstack.com/start) (React, SSR), shadcn/ui and [Animate UI](https://animate-ui.com); its server side calls the API through a typed Effect client |
| `packages/domain` | Shared between the two: the API contract (`Api.ts`, Effect Schema) and the theme system (`themes.ts`) |
| `.railway/` | Railway Infrastructure as Code: Postgres, `api`, `web`, `analytics`, and the `uploads` and `lake` buckets |
| `.github/workflows` | `ci.yml` (typecheck, build, test) and `railway-config.yml` (plan on PR, apply on merge) |

## What's here

- **Accounts** via GitHub only (`/login`). Your GitHub login and avatar refresh every time you sign in.
- **Profiles** at `/u/<github-login>` with display name, status, pronouns, location, favorite waifu, bio, skills, website and links, an animated banner, and a profile theme. Customize them at `/settings`, with a live preview.
- **Themes**: five built-ins (Sakura, Yoru, Matcha, Sora, Tsundere) plus community themes made in the live editor at `/themes/new`. The theme you wear styles the site for you. Your profile shows the profile theme you picked (or the theme you wear, if you didn't pick one) to everyone who visits it, header and all. Themes can be public or private.
- **Members** directory at `/members`.
- **News** at `/news`: a Hacker News style board. Members post a link, some text, or both (`/news/submit`), give posts a heart (one per member; your own post starts with yours), and talk in threaded comments on each post's page. **Top** ranks like HN, hearts divided by (hours old + 2)^1.8; **New** is newest first.
- **Projects** at `/projects`: what the community is building (fuwa, and this site), each with a live demo. The list is code, in `apps/web/src/lib/projects.ts`; a new project there shows up with its glyph as its visual until it gets a custom one in `components/projects/Project.tsx`.

**Themes are shadcn theme variants**: every theme, built-in or member-made, is a full set of values for the shadcn tokens (`--background`, `--primary`, `--muted-foreground`, …, plus `--radius`), stored as `{ tokens, radius }`. The root route applies the viewer's variant to `<html>`, except on profile pages, where it applies the owner's profile theme. Stick to shadcn token classes (`bg-card`, `text-muted-foreground`, `bg-primary`, …) instead of fixed colors so every theme works. shadcn/ui components live in `apps/web/src/components/ui`, Animate UI ones in `apps/web/src/components/animate-ui`.

## The API

`packages/domain/src/Api.ts` declares every endpoint once with `HttpApi`; `apps/api/src/Http.ts` implements it and `apps/web/src/server/Api.ts` derives a typed client from it, so the two apps can't drift apart.

| Endpoint | |
| --- | --- |
| `GET /users`, `/users/:username`, `/users/:username/themes`, `/stats` | Members and their public themes |
| `GET /themes`, `/themes/:id` | Community and built-in themes |
| `GET/PATCH /me`, `PUT /me/theme`, `GET /me/themes` | The signed-in member (bearer token) |
| `POST /themes`, `DELETE /themes/:id` | Make or delete your themes |
| `GET /posts?sort=top\|new&page=`, `/posts/:id` | News posts, and one post with its comments (a bearer token is optional; with one, `voted` says whether you hearted it) |
| `POST /posts`, `DELETE /posts/:id`, `PUT/DELETE /posts/:id/vote`, `POST /posts/:id/comments` | Post, delete your post, heart or unheart, comment or reply |
| `POST /session/revoke` | Sign out (revokes a refresh token) |
| `/authorize`, `/token`, `/github/*`, `/.well-known/*` | The OpenAuth issuer |
| `GET /health` | Healthcheck |

The schema is in `apps/api/src/schema.ts`; Drizzle Kit writes migrations into `apps/api/migrations`, and Railway runs them before each API deploy.

## Analytics

fuwa servers send a small anonymous usage signal home about 5 minutes after they start and then once a day, unless their operator turns it off. `apps/analytics` receives it and keeps it in a DuckLake: an embedded DuckDB whose catalog is the `ducklake` schema of our Postgres and whose Parquet files live in the private `lake` Railway bucket.

A signal carries a random install id (a ULID), the fuwa version, OS, architecture, whether it's our hosted instance, a few settings (sign-ups, linked accounts, server creation, encryption, whether limits are set) and totals: accounts (and how many were active in the last day and month), servers, members, channels, messages, attachments and storage bytes. Nothing identifies a person or a community, and the lake keeps no IP addresses. The format is fuwa's `fuwa.signal.v1`, mirrored in `apps/analytics/src/Signals.ts`:

```http
POST /v1/fuwa/signals
{ "schema": "fuwa.signal.v1", "install_id", "sent_at", "hosting", "version", "os", "arch", "uptime_seconds", "config": {...}, "totals": {...} }
```

A valid signal (up to 64 KB) gets `202 {"accepted": 1}` and an invalid one `400`; fuwa retries anything else on its next cycle. Fields fuwa adds within v1 are kept in each row's `raw` JSON until they get a column. A signal delivered twice counts once (per install and `sent_at`). Activity such as messages sent comes from the difference between an install's consecutive signals, because fuwa's lifetime counters only grow.

Accepted signals are buffered and written every 30 seconds as one lake snapshot, and whatever is left is written on shutdown. Small writes stay inline in Postgres until the nightly `CHECKPOINT` (04:00 UTC) moves them into monthly Parquet files, merges small files and expires snapshots older than 30 days.

Reading it:

- `GET /v1/fuwa/summary?days=30` with `Authorization: Bearer $ANALYTICS_READ_TOKEN` returns installs, totals and activity per day and kind of hosting, plus which versions installs run.
- For any other question, open a read-only SQL console next to the lake with `railway ssh --service analytics`, then `node apps/analytics/dist/sql.js "FROM daily ORDER BY day DESC"`. The views are `signals_unique`, `installs` (each install as of its last signal), `activity` (each signal with what happened since the previous one) and `daily`.

## How sign-in works

The API hosts the OpenAuth issuer (at the root, because OpenAuth hardcodes its paths); the web app is its only client (`waifu-devs-web`).

1. `/api/auth/login` on the web starts an authorization-code flow with PKCE and sends you to the API, which sends you to GitHub.
2. GitHub returns to the API's `/github/callback`. The issuer reads your GitHub profile, creates or updates your `users` row, and redirects to the web's `/api/auth/callback` with a code.
3. The web trades the code for an access token (1 hour) and a refresh token (1 year), stored in `HttpOnly` cookies, and calls the API with the access token.
4. The web refreshes an expired access token on the next request. Signing out revokes the refresh token.

OpenAuth's own storage (signing keys, codes, refresh tokens) lives in the `openauth_storage` table.

## Local development

You need Node 22 and a local Postgres (`postgres://postgres:postgres@localhost:5432/waifu`).

1. Create a GitHub OAuth app for development at <https://github.com/settings/developers> with
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:4000/github/callback`
2. `cp apps/api/.env.example apps/api/.env` and fill in its client ID and secret; `cp apps/web/.env.example apps/web/.env`.
3. Install, migrate and run:

   ```sh
   pnpm install
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/waifu pnpm db:migrate
   pnpm dev          # web on http://localhost:3000, API on http://localhost:4000, analytics on http://localhost:4100
   ```

`pnpm typecheck` and `pnpm build` check and build everything, and `pnpm -r test` runs the tests. Analytics needs no setup locally: without `DATABASE_URL` and `S3_BUCKET` its lake lives in `apps/analytics/.lake`. To change the schema, edit `apps/api/src/schema.ts`, run `pnpm db:generate`, and commit the new migration.

## Infrastructure

The Railway project is public, so anyone can check out the live infrastructure behind the site at <https://railway.com/project/c1d0e00f-7c4c-408f-8422-41cd680bc304>. It's what `.railway/railway.ts` declares: Postgres, the `api`, `web` and `analytics` services, and the `uploads` and `lake` buckets.

## Deploying on Railway

Everything lives in the **waifu-devs** Railway project, production environment, in the US East (Virginia) region. `.railway/railway.ts` declares Postgres, the `uploads` and `lake` buckets, and the `api`, `web` and `analytics` services (built from `main` of this repo with Railpack) along with their domains, `api.waifu.dev`, `www.waifu.dev` and `analytics.waifu.dev`; a pull request that touches `.railway/` gets a plan comment, and merging applies it. Code changes deploy on their own when they land on `main`.

One-time setup:

1. **Railway GitHub App**: install it on the `waifu-devs` org with access to this repo, so Railway can build it (<https://github.com/apps/railway-app>).
2. **Project token**: in the Railway project, Settings → Tokens, create a token for the production environment and save it as the `RAILWAY_TOKEN` repository secret here.
3. **GitHub OAuth app** for production, with the callback URL `https://api.waifu.dev/github/callback`. Put its credentials in the production environment's **shared variables** `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (Project Settings → Shared Variables).
4. **Analytics read token**: a shared variable `ANALYTICS_READ_TOKEN` holding a long random string (for example `openssl rand -hex 32`). Until it exists, nobody can read the summary.
5. Merge a pull request that touches `.railway/` (the first one creates everything).
6. **Analytics domain**: Railway configuration can't register a new custom domain, so once `analytics` exists, add `analytics.waifu.dev` (port 4100) in its Settings → Networking, then declare it in `.railway/railway.ts` like the others.
7. **DNS**: at the `waifu.dev` registrar, point `api`, `www` and `analytics` at the CNAME targets Railway shows in each service's Settings → Networking.
