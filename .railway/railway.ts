import { defineRailway, github, postgres, project, service } from "railway/iac";

/**
 * Everything Waifu Devs runs on Railway: Postgres, the Effect API (which is also the
 * OpenAuth issuer) and the TanStack Start site. Pull requests that touch .railway/ get
 * a plan comment; merging applies it (.github/workflows/railway-config.yml).
 *
 * Set once by hand, not here:
 * - Shared variables GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET (the GitHub OAuth app).
 * - A generated Railway domain for `api` and for `web` (IaC doesn't manage those).
 *   The URLs below resolve from them.
 */
export default defineRailway((ctx) => {
  const repo = github("waifu-devs/site", { branch: "main" });
  const db = postgres("postgres");

  const api = service("api", {
    source: repo,
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm --filter @waifu-devs/api build",
      watchPatterns: ["apps/api/**", "packages/domain/**", "pnpm-lock.yaml"],
    },
    preDeploy: "pnpm --filter @waifu-devs/api db:migrate",
    start: "node apps/api/dist/main.js",
    healthcheck: "/health",
    env: {
      NODE_ENV: "production",
      PORT: "4000",
      DATABASE_URL: db.env.DATABASE_URL,
      // The API is the OpenAuth issuer; tokens carry this URL as `iss`.
      ISSUER_URL: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
      // Only this site may use the issuer's redirects.
      WEB_URL: "https://${{web.RAILWAY_PUBLIC_DOMAIN}}",
      GITHUB_CLIENT_ID: ctx.shared.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: ctx.shared.GITHUB_CLIENT_SECRET,
    },
  });

  const web = service("web", {
    source: repo,
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm --filter @waifu-devs/web build",
      watchPatterns: ["apps/web/**", "packages/domain/**", "pnpm-lock.yaml"],
    },
    start: "node apps/web/.output/server/index.mjs",
    healthcheck: "/api/health",
    env: {
      NODE_ENV: "production",
      PORT: "3000",
      WEB_URL: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
      // The browser goes to the API's public URL to sign in...
      API_URL: "https://${{api.RAILWAY_PUBLIC_DOMAIN}}",
      // ...while the web server calls it over the private network.
      API_INTERNAL_URL: "http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}",
    },
  });

  return project("waifu-devs", { resources: [db, api, web] });
});
