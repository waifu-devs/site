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
      // Paste the Hyperdrive config's id below (Dashboard → Hyperdrive → your
      // config). It isn't secret. Locally the binding connects straight to
      // DATABASE_URL instead.
      HYPERDRIVE: bindings.hyperdrive({
        id: process.env.HYPERDRIVE_ID ?? "PASTE_HYPERDRIVE_ID_HERE",
        dev: { connectionString: process.env.DATABASE_URL },
      }),
      GITHUB_CLIENT_ID: bindings.secret(),
      GITHUB_CLIENT_SECRET: bindings.secret(),
    },
  }),
});
