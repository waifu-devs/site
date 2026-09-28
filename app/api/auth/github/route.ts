import { env } from "cloudflare:workers";
import { OAUTH_STATE_COOKIE, safeNext } from "@/lib/oauth";
import { randomToken } from "@/lib/session";

/** Starts the GitHub OAuth flow. `?next=/path` is where to land after signing in. */
export function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const state = randomToken(16);

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${url.origin}/api/auth/callback`);
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "true");

  const secure = url.protocol === "https:" ? "; Secure" : "";
  const cookie = `${OAUTH_STATE_COOKIE}=${state}:${encodeURIComponent(next)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
  return new Response(null, {
    status: 302,
    headers: { Location: authorize.toString(), "Set-Cookie": cookie },
  });
}
