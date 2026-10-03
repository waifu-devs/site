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

- **Accounts** via GitHub only (`/login`). Your GitHub login and avatar refresh every time you sign in. The API keeps its own copy of your GitHub avatar (resized like an upload) and serves it from `/media`, so visitors' browsers never fetch anything from GitHub.
- **Profiles** at `/u/<github-login>` with display name, status, pronouns, location, favorite waifu, bio, skills, website and links, an animated banner, a profile theme, and up to six featured GitHub repos. Customize them at `/settings`, with a live preview.
- **Featured repos**: members pick public repos they own, or that belong to organizations they're a public member of, from a searchable list in `/settings`, and drag them into order. The API fetches that list from GitHub as the site's OAuth app (its client ID and secret, for the higher rate limit), keeps it for ten minutes, and only lets a member feature repos from it. Cards keep a copy of each repo's description, language, stars and forks; when a profile is visited and the copy is over six hours old, it's refreshed in the background, and a repo that's gone or private comes off the profile.
- **Themes**: five built-ins (Sakura, Yoru, Matcha, Sora, Tsundere) plus community themes made in the live editor at `/themes/new`. The theme you wear styles the site for you, and you don't need an account to wear one: signed out, a cookie remembers any built-in or public theme you pick, and signing in puts it on your account if that still wears the default (as new accounts do). Your profile shows the profile theme you picked (or the theme you wear, if you didn't pick one) to everyone who visits it, header and all. Themes can be public or private.
- **Members** directory at `/members`.
- **News** at `/news`: a Hacker News style board. Members post a link, some text, or both (`/news/submit`), give posts a heart (one per member; your own post starts with yours), and talk in threaded comments on each post's page. **Top** ranks like HN, hearts divided by (hours old + 2)^1.8; **New** is newest first.
- **Projects** at `/projects`: what the community is building (fuwa, and this site), each with a live demo. The list is code, in `apps/web/src/lib/projects.ts`; a new project there shows up with its glyph as its visual until it gets a custom one in `components/projects/Project.tsx`.

**Themes are shadcn theme variants**: every theme, built-in or member-made, is a full set of values for the shadcn tokens (`--background`, `--primary`, `--muted-foreground`, …, plus `--radius`), stored as `{ tokens, radius }`. The root route applies the viewer's variant to `<html>`, except on profile pages, where it applies the owner's profile theme. Stick to shadcn token classes (`bg-card`, `text-muted-foreground`, `bg-primary`, …) instead of fixed colors so every theme works. shadcn/ui components live in `apps/web/src/components/ui`, Animate UI ones in `apps/web/src/components/animate-ui`.

## The API

`packages/domain/src/Api.ts` declares every endpoint once with `HttpApi`; `apps/api/src/Http.ts` implements it and `apps/web/src/server/Api.ts` derives a typed client from it, so the two apps can't drift apart.

| Endpoint | |
| --- | --- |
| `GET /users`, `/users/:username`, `/users/:username/themes`, `/users/:username/repos`, `/stats` | Members, their public themes and their featured repos |
| `GET /themes`, `/themes/:id` | Community and built-in themes |
| `GET/PATCH /me`, `PUT /me/theme`, `GET /me/themes` | The signed-in member (bearer token) |
| `GET /me/repos/choices`, `PUT /me/repos` | The public repos you could feature, and featuring them (503 when GitHub isn't answering) |
| `POST /themes`, `DELETE /themes/:id` | Make or delete your themes |
| `GET /posts?sort=top\|new&page=`, `/posts/:id` | News posts, and one post with its comments (a bearer token is optional; with one, `voted` says whether you hearted it) |
| `POST /posts`, `DELETE /posts/:id`, `PUT/DELETE /posts/:id/vote`, `POST /posts/:id/comments` | Post, delete your post, heart or unheart, comment or reply |
| `POST /session/revoke` | Sign out (revokes a refresh token) |
| `GET /userinfo` | Who signed in, for a fuwa instance that signed them in with waifu.dev (see [Signing in to fuwa](#signing-in-to-fuwa)) |
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

A valid signal (up to 8 KB) gets `202 {"accepted": 1}` and an invalid one `400`; fuwa retries anything else on its next cycle. Fields fuwa adds within v1 are kept in each row's `raw` JSON until they get a column. A signal delivered twice counts once (per install and `sent_at`). Activity such as messages sent comes from the difference between an install's consecutive signals, because fuwa's lifetime counters only grow.

Accepted signals are buffered and written every 30 seconds as one lake snapshot, and whatever is left is written on shutdown. While the lake can't be reached, the buffer holds up to 64 MB of signals (`INGEST_MAX_PENDING_BYTES`); past that, signals get `503` and fuwa sends them again later. Small writes stay inline in Postgres until the nightly `CHECKPOINT` (04:00 UTC) moves them into monthly Parquet files, merges small files and expires snapshots older than 30 days.

Reading it:

- `GET /v1/fuwa/summary?days=30` with `Authorization: Bearer $ANALYTICS_READ_TOKEN` returns installs, totals and activity per day and kind of hosting, plus which versions installs run.
- For any other question, open a read-only SQL console next to the lake with `railway ssh --service analytics`, then `node apps/analytics/dist/sql.js "FROM daily ORDER BY day DESC"`. The views are `signals_unique`, `installs` (each install as of its last signal), `activity` (each signal with what happened since the previous one) and `daily`.

### Bug and performance reports

Our apps also count what went wrong and how long things took, so we can find bugs and slow paths. No app sends these here itself: each fuwa server adds its web and desktop apps' counts to its own, and this site's web server adds visitors' browsers' counts together (`POST /api/reports` on the site, then over Railway's private network), so no browser or desktop app ever talks to the analytics service. Reports are counts only: kinds of errors and where in the code or which page (a route pattern, never an address), durations in fixed buckets, how often a few features are used, with app version, platform and OS family. Never message text, names, ids, links or IP addresses. fuwa operators turn reports off with the same switch as the signal; every app has its own "Help fix bugs" or "Anonymous bug reports" switch, and the site's starts off for browsers that send Global Privacy Control or Do Not Track.

```http
POST /v1/fuwa/reports   (hourly, from each fuwa server process)
POST /v1/site/reports   (every 10 minutes, from the site's web server)
{ "schema": "fuwa.report.v1" | "site.report.v1", "report_id", "install_id"?, "hosting", "part", "since", "sent_at", "bounds_ms": [...],
  "errors": [{ app, version, platform, os, kind, place, count }], "timings": [{ ..., metric, buckets, count, sum_ms }], "usage": [{ ..., feature, count }] }
```

Reports (up to 256 KB) go through the same buffer as signals, into the `reports` schema: `reports`, `errors`, `timings` and `usage`, each with a `_unique` view that counts a report delivered twice once.

`/v1/site/reports` only takes requests that come over Railway's private network: one addressed to the public domain, or carrying any header Railway's edge adds, gets `403`. Each sender may send 30 signals or reports an hour (`INGEST_MAX_PER_SENDER_HOUR`), counted by its install id (or, without one, by source), never by address, and everyone together 300 a minute (`INGEST_MAX_PER_MINUTE`); past either, `429`, and that report is dropped. Platforms and OS families are lowercase family names and versions look like `0.1.0`, so neither can hold an address or an email. Fields a report adds beyond v1 are kept in `raw` only while they're under 2 KB together.

- `GET /v1/reports/summary?days=7&source=fuwa` (same bearer token; `source` is optional) returns the most frequent errors (with how many installs saw them, on which platforms and OSes, first and last seen), the slowest timings by p95 (with p50, p99, average and how many took over a second), and feature use.
- `node apps/analytics/dist/sql.js "FROM reports.errors_unique ORDER BY sent_at DESC LIMIT 20"` for anything else.

## How sign-in works

The API hosts the OpenAuth issuer (at the root, because OpenAuth hardcodes its paths). The web app is its own client (`waifu-devs-web`), and the only one whose tokens open the API; fuwa servers sign people in too (below).

1. `/api/auth/login` on the web starts an authorization-code flow with PKCE and sends you to the API, which sends you to GitHub.
2. GitHub returns to the API's `/github/callback`. The issuer reads your GitHub profile, creates or updates your `users` row, and redirects to the web's `/api/auth/callback` with a code.
3. The web trades the code for an access token (1 hour) and a refresh token (1 year), stored in `HttpOnly` cookies, and calls the API with the access token.
4. The web refreshes an expired access token on the next request. Signing out revokes the refresh token.

OpenAuth's own storage (signing keys, codes, refresh tokens) lives in the `openauth_storage` table.

### Signing in to fuwa

Any fuwa server can let people sign in with their waifu.dev account. The server is its own OpenAuth client: its client ID is its address (`https://chat.example.com`, or `http://localhost:…` while testing) and the sign-in can only come back to `<that address>/auth/waifu/callback`, with the code flow and PKCE (S256). Anything else gets a 400 before OpenAuth sees it, so a refused sign-in never redirects anywhere.

Because GitHub approves a returning member's sign-in without asking, any site could otherwise pose as a fuwa server and quietly learn a visitor's waifu.dev account. So before a sign-in for any app but the web app goes on, `/authorize` shows a page on `api.waifu.dev` ("<host> wants to sign you in with your waifu.dev account", Continue or Cancel; `apps/api/src/Consent.ts`). Continue is the same request plus a `consent` parameter, an HMAC (keyed from `GITHUB_CLIENT_SECRET`) over that exact request, an expiry ten minutes out and a nonce whose other half is in a `SameSite=Strict` cookie set with the page; the cookie is cleared once used. The page can't be framed, and `/github/authorize` refuses cross-site navigations, so nothing gets around the question. Cancel goes back to the app's callback with `error=access_denied`.

The server trades the code for an access token made out to it (`aud` is its client ID) and asks `GET /userinfo` who signed in: `sub` (the member's id, which never changes), `preferred_username`, `name`, `picture` and `profile`. The rest of the API only takes the web app's tokens (`aud` = `waifu-devs-web`), so a fuwa server learns who you are and can't act as you here.

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

Its logs are public too, so the services log requests as method, path and status only: no query strings (they can carry sign-in codes), no addresses, no bodies, and nothing at all for the sign-in paths (`/authorize`, `/github/*`). Failures are logged by kind, without the values that caused them.

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
