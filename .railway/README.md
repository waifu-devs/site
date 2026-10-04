# Railway infrastructure

`railway.ts` describes the whole Railway project (Postgres, `api`, `web`,
`analytics`, `status`, the `uploads` bucket where the api keeps uploaded pictures, the
`lake` bucket holding the analytics DuckLake files, their region and their
custom domains) with
[Railway Infrastructure as Code](https://docs.railway.com/infrastructure-as-code).
It's the single source of truth: a resource or variable removed from the file is
removed from Railway on the next apply.

## How changes ship

1. Open a pull request that edits `.railway/`.
2. The `Railway config` workflow comments the plan (what will change) on the PR.
3. Merging applies exactly that plan. If the environment changed in the meantime
   (say, a variable edited in the dashboard, shared variables included), the
   apply refuses the stale plan. Before merging, push any commit to the PR to
   re-plan. After merging, open a new PR that touches `.railway/` and merge that
   one. So set any shared variable a PR needs before its plan runs, or after its
   apply finishes, never in between.

Code changes deploy on their own: Railway builds `main` whenever the files in a
service's watch patterns change.

## Running it by hand

```bash
npm install            # installs the `railway` SDK at the repo root
railway link           # pick the waifu-devs project, production environment
railway config plan    # preview
railway config apply   # apply
```

## Not managed here

- The `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN` (optional), `ANALYTICS_READ_TOKEN` and `STATUS_DB_PASSWORD` (at least 24 characters, like `openssl rand -hex 32`) shared variables (secrets stay in Railway).
- The DNS records for `api.waifu.dev`, `www.waifu.dev`, `analytics.waifu.dev` and `status.waifu.dev` (they're at the registrar).
- Registering a new custom domain: Railway configuration refuses to, so add it to the
  service in the dashboard first (after the apply that creates the service), then
  declare it in `railway.ts` so later applies keep it.
