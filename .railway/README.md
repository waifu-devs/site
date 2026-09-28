# Railway infrastructure

`railway.ts` describes the whole Railway project (Postgres, `api`, `web`, the
`uploads` bucket where the api keeps uploaded pictures, their region and their
custom domains) with
[Railway Infrastructure as Code](https://docs.railway.com/infrastructure-as-code).
It's the single source of truth: a resource or variable removed from the file is
removed from Railway on the next apply.

## How changes ship

1. Open a pull request that edits `.railway/`.
2. The `Railway config` workflow comments the plan (what will change) on the PR.
3. Merging applies exactly that plan. If the environment changed in the meantime
   (say, a variable edited in the dashboard), the apply refuses the stale plan.
   Before merging, push any commit to the PR to re-plan. After merging, open a
   new PR that touches `.railway/` and merge that one.

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

- The `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` shared variables (secrets stay in Railway).
- The DNS records for `api.waifu.dev` and `www.waifu.dev` (they're at the registrar).
