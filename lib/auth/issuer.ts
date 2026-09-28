import { env, waitUntil } from "cloudflare:workers";
import { issuer } from "@openauthjs/openauth";
import { GithubProvider } from "@openauthjs/openauth/provider/github";
import { connect, upsertGithubUser } from "../db";
import { PostgresStorage } from "./storage";
import { subjects } from "./subjects";

export const CLIENT_ID = "waifu-devs-site";

/**
 * OpenAuth serves these at the site root (they're hardcoded in the issuer, so
 * it can't be mounted under a prefix). middleware.ts hands them to handleIssuer.
 */
export function isIssuerPath(pathname: string): boolean {
  return (
    pathname === "/authorize" ||
    pathname === "/token" ||
    pathname.startsWith("/github/") ||
    pathname.startsWith("/.well-known/")
  );
}

type GithubUser = { id: number; login: string; name: string | null; avatar_url: string };

/** Runs one request through the OpenAuth issuer, inside this Worker. */
export async function handleIssuer(request: Request): Promise<Response> {
  // Middleware runs outside a render, so the issuer gets its own short-lived client.
  const db = connect(env.HYPERDRIVE.connectionString, 1);
  try {
    const app = issuer({
      subjects,
      storage: PostgresStorage(db),
      // Access tokens can't be revoked, so keep them short; proxy.ts refreshes them.
      ttl: { access: 60 * 60 },
      providers: {
        github: GithubProvider({
          clientID: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          scopes: ["read:user"],
        }),
      },
      // Only this site may start a sign-in, and only back to its own host.
      async allow({ clientID, redirectURI }, req) {
        return clientID === CLIENT_ID && new URL(redirectURI).host === new URL(req.url).host;
      },
      async success(ctx, value) {
        const res = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${value.tokenset.access}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "waifu-devs-site",
          },
        });
        if (!res.ok) throw new Error("Could not read your GitHub profile.");
        const user = await upsertGithubUser(db, (await res.json()) as GithubUser);
        return ctx.subject("user", { id: user.id });
      },
    });
    return await app.fetch(request);
  } finally {
    waitUntil(db.$client.end());
  }
}
