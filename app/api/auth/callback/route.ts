import { env } from "cloudflare:workers";
import { upsertGithubUser } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { OAUTH_STATE_COOKIE, safeNext } from "@/lib/oauth";

type GithubUser = { id: number; login: string; name: string | null; avatar_url: string };

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
}

function fail(message: string, status = 400) {
  return new Response(`Sign-in failed: ${message}`, { status });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const stored = readCookie(request, OAUTH_STATE_COOKIE);
  const sep = stored?.indexOf(":") ?? -1;
  if (!code || !state || !stored || sep < 0 || stored.slice(0, sep) !== state) {
    return fail("the login link expired or was tampered with. Please try again.");
  }
  const next = safeNext(decodeURIComponent(stored.slice(sep + 1)));

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/auth/callback`,
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!token.access_token) return fail(token.error_description ?? "GitHub did not return a token.", 502);

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "waifu-devs-site",
    },
  });
  if (!userRes.ok) return fail("could not read your GitHub profile.", 502);
  const gh = (await userRes.json()) as GithubUser;

  const user = await upsertGithubUser(gh);
  const session = await createSession(user.id);

  const secure = url.protocol === "https:" ? "; Secure" : "";
  const headers = new Headers({ Location: next });
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${session.maxAge}${secure}`,
  );
  headers.append("Set-Cookie", `${OAUTH_STATE_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  return new Response(null, { status: 302, headers });
}
