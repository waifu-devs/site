# Railway infrastructure

`railway.ts` describes the whole Railway project (Postgres, `api`, `web`) with
[Railway Infrastructure as Code](https://docs.railway.com/infrastructure-as-code).
It's the single source of truth: a resource or variable removed from the file is
removed from Railway on the next apply.

## How changes ship

1. Open a pull request that edits `.railway/`.
2. The `Railway config` workflow comments the plan (what will change) on the PR.
3. Merging applies exactly that plan. If the environment changed in the meantime,
   the apply fails and the PR needs a fresh plan (push any commit to it).

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
- Generated `*.up.railway.app` domains for `api` and `web`.
