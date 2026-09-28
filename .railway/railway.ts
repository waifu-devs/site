import { defineRailway, github, postgres, project, service } from "railway/iac";

/**
 * Everything Waifu Devs runs on Railway: Postgres, the Effect API (which is also the
 * OpenAuth issuer) and the TanStack Start site. Pull requests that touch .railway/ get
 * a plan comment; merging applies it (.github/workflows/railway-config.yml).
 *
 * Set once by hand, not here: the shared variables GITHUB_CLIENT_ID and
 * GITHUB_CLIENT_SECRET (the GitHub OAuth app, whose callback is API_URL + /github/callback).
 * The DNS records for the domains live with the waifu.dev registrar.
 */

/** Railway's US East (Virginia) region. Everything runs here, next to the database. */
const REGION = "us-east4-eqdc4a";

/**
 * Railway merges a service's regions into the ones it already has, so moving a service
 * means naming the region it leaves as null. The services started out in "sfo".
 */
const placement = { multiRegionConfig: { sfo: null, [REGION]: { numReplicas: 1 } } };

const API_DOMAIN = "api.waifu.dev";
const WEB_DOMAIN = "www.waifu.dev";
const API_URL = `https://${API_DOMAIN}`;
const WEB_URL = `https://${WEB_DOMAIN}`;

export default defineRailway((ctx) => {
  const repo = github("waifu-devs/site", { branch: "main" });
  const db = postgres("postgres", { region: REGION });

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
    deploy: placement,
    domains: [{ domain: API_DOMAIN, port: 4000 }],
    env: {
      NODE_ENV: "production",
      PORT: "4000",
      DATABASE_URL: db.env.DATABASE_URL,
      // The API is the OpenAuth issuer; tokens carry this URL as `iss`.
      ISSUER_URL: API_URL,
      // Only this site may use the issuer's redirects.
      WEB_URL,
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
    deploy: placement,
    domains: [{ domain: WEB_DOMAIN, port: 3000 }],
    env: {
      NODE_ENV: "production",
      PORT: "3000",
      WEB_URL,
      // The browser goes to the API's public URL to sign in...
      API_URL,
      // ...while the web server calls it over the private network.
      API_INTERNAL_URL: "http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}",
    },
  });

  return project("waifu-devs", { resources: [db, api, web] });
});
