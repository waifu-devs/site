import { bucket, defineRailway, github, postgres, project, ref, service } from "railway/iac";

/**
 * Everything Waifu Devs runs on Railway: Postgres, the Effect API (which is also the
 * OpenAuth issuer), the TanStack Start site, and the analytics service that keeps the
 * anonymous usage signals fuwa servers send in a DuckLake. Pull requests that touch
 * .railway/ get a plan comment; merging applies it (.github/workflows/railway-config.yml).
 *
 * Set once by hand, not here: the shared variables GITHUB_CLIENT_ID and
 * GITHUB_CLIENT_SECRET (the GitHub OAuth app, whose callback is API_URL + /github/callback)
 * and ANALYTICS_READ_TOKEN (the bearer token for reading analytics).
 * The DNS records for the domains live with the waifu.dev registrar.
 */

/** Railway's US East (Virginia) region. Everything runs here, next to the database. */
const REGION = "us-east4-eqdc4a";
/** Buckets have their own region names; this is Virginia too. It can't change once created. */
const BUCKET_REGION = "iad";

const API_DOMAIN = "api.waifu.dev";
const WEB_DOMAIN = "www.waifu.dev";
/** Where fuwa servers send their usage signals. */
const ANALYTICS_DOMAIN = "analytics.waifu.dev";
const API_URL = `https://${API_DOMAIN}`;
const WEB_URL = `https://${WEB_DOMAIN}`;

export default defineRailway((ctx) => {
  const repo = github("waifu-devs/site", { branch: "main" });
  const db = postgres("postgres", { region: REGION });
  // Pictures members upload (avatars and banners). Railway buckets are private,
  // so the api writes them and serves them at API_URL/media/<key>.
  const uploads = bucket("uploads", { region: BUCKET_REGION });

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
    regions: { [REGION]: 1 },
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
      S3_ENDPOINT: ref(uploads, "ENDPOINT"),
      S3_REGION: ref(uploads, "REGION"),
      S3_BUCKET: ref(uploads, "BUCKET"),
      S3_ACCESS_KEY_ID: ref(uploads, "ACCESS_KEY_ID"),
      S3_SECRET_ACCESS_KEY: ref(uploads, "SECRET_ACCESS_KEY"),
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
    regions: { [REGION]: 1 },
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

  // The analytics DuckLake: its catalog is the `ducklake` schema in Postgres, and its
  // Parquet files go in this bucket, which only the analytics service can reach.
  const lake = bucket("lake", { region: BUCKET_REGION });

  const analytics = service("analytics", {
    source: repo,
    build: {
      builder: "RAILPACK",
      // Also downloads the DuckDB extensions it loads (DuckLake, Postgres, httpfs).
      buildCommand: "pnpm --filter @waifu-devs/analytics build",
      watchPatterns: ["apps/analytics/**", "pnpm-lock.yaml"],
    },
    start: "node apps/analytics/dist/main.js",
    healthcheck: "/health",
    regions: { [REGION]: 1 },
    // Added in the dashboard first (Railway configuration can't register a new custom
    // domain), declared here so later applies keep it.
    domains: [{ domain: ANALYTICS_DOMAIN, port: 4100 }],

    // Accepted signals wait in memory for a few seconds; on shutdown they're written
    // out before the process exits, so give that time to finish.
    deploy: { drainingSeconds: 30 },
    env: {
      NODE_ENV: "production",
      PORT: "4100",
      DATABASE_URL: db.env.DATABASE_URL,
      S3_ENDPOINT: ref(lake, "ENDPOINT"),
      S3_REGION: ref(lake, "REGION"),
      S3_BUCKET: ref(lake, "BUCKET"),
      S3_ACCESS_KEY_ID: ref(lake, "ACCESS_KEY_ID"),
      S3_SECRET_ACCESS_KEY: ref(lake, "SECRET_ACCESS_KEY"),
      // Reading (GET /v1/fuwa/summary) needs this as a bearer token; while unset, nobody can read.
      ANALYTICS_READ_TOKEN: ctx.shared.ANALYTICS_READ_TOKEN,
    },
  });

  return project("waifu-devs", { resources: [db, uploads, lake, api, web, analytics] });
});
