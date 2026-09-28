import { authClient } from "@/lib/auth/client";
import { LOGIN_COOKIE, safeNext } from "@/lib/oauth";

/** Starts a GitHub sign-in through OpenAuth. `?next=/path` is where to land afterwards. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const { challenge, url: authorize } = await authClient(url.origin).authorize(
    `${url.origin}/api/auth/callback`,
    "code",
    { provider: "github", pkce: true },
  );

  // Remember the state (CSRF check), PKCE verifier and destination for the callback.
  const value = encodeURIComponent(JSON.stringify({ state: challenge.state, verifier: challenge.verifier, next }));
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize,
      "Set-Cookie": `${LOGIN_COOKIE}=${value}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
    },
  });
}
