import { ACCESS_COOKIE, authClient, REFRESH_COOKIE, tokenCookie } from "@/lib/auth/client";
import { LOGIN_COOKIE, safeNext } from "@/lib/oauth";

type LoginState = { state?: string; verifier?: string; next?: string };

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
}

function readLoginState(request: Request): LoginState {
  try {
    return JSON.parse(decodeURIComponent(readCookie(request, LOGIN_COOKIE) ?? "")) as LoginState;
  } catch {
    return {};
  }
}

function fail(message: string, status = 400) {
  return new Response(`Sign-in failed: ${message}`, { status });
}

/** OpenAuth sends the browser back here with a code to trade for tokens. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (error) return fail(error);

  const code = url.searchParams.get("code");
  const login = readLoginState(request);
  if (!code || !login.state || login.state !== url.searchParams.get("state")) {
    return fail("the login link expired or was tampered with. Please try again.");
  }

  const exchanged = await authClient(url.origin).exchange(code, `${url.origin}/api/auth/callback`, login.verifier);
  if (exchanged.err) return fail("the sign-in code was rejected. Please try again.", 502);

  const secure = url.protocol === "https:";
  const headers = new Headers({ Location: safeNext(login.next ?? null) });
  headers.append("Set-Cookie", tokenCookie(ACCESS_COOKIE, exchanged.tokens.access, secure));
  headers.append("Set-Cookie", tokenCookie(REFRESH_COOKIE, exchanged.tokens.refresh, secure));
  headers.append("Set-Cookie", `${LOGIN_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`);
  return new Response(null, { status: 302, headers });
}
