import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "waifu-devs-site",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-09-28",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      // Hyperdrive pools connections to the PlanetScale Postgres database.
      // Set HYPERDRIVE_ID to the id from `cf hyperdrive create`; locally it
      // connects straight to DATABASE_URL instead.
      HYPERDRIVE: bindings.hyperdrive({
        id: process.env.HYPERDRIVE_ID ?? "00000000000000000000000000000000",
        dev: { connectionString: process.env.DATABASE_URL },
      }),
      GITHUB_CLIENT_ID: bindings.secret(),
      GITHUB_CLIENT_SECRET: bindings.secret(),
    },
  }),
});
