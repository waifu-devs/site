import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, authClient, REFRESH_COOKIE, tokenCookie } from "@/lib/auth/client";
import { handleIssuer, isIssuerPath } from "@/lib/auth/issuer";
import { subjects } from "@/lib/auth/subjects";

/** Rewrites the Cookie header so pages rendered in this request see the new tokens. */
function withCookies(header: string | null, updates: Record<string, string | null>): string {
  const jar = new Map<string, string>();
  for (const part of (header ?? "").split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
  for (const [name, value] of Object.entries(updates)) {
    if (value === null) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

export async function proxy(request: NextRequest) {
  const { origin, pathname, protocol } = request.nextUrl;

  // The OpenAuth issuer lives in this Worker, at the root paths it expects.
  if (isIssuerPath(pathname)) return handleIssuer(request);

  // Swap an expired access token for a fresh one before anything renders.
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) return NextResponse.next();

  let result: { err?: unknown; tokens?: { access: string; refresh: string } };
  try {
    const client = authClient(origin);
    result = access ? await client.verify(subjects, access, { refresh }) : await client.refresh(refresh);
  } catch (error) {
    // The issuer couldn't be reached (e.g. the database hiccuped). Keep the
    // cookies so a transient failure doesn't sign anyone out.
    console.error("token refresh failed", error);
    return NextResponse.next();
  }
  if (!result.err && !result.tokens) return NextResponse.next();

  const tokens = result.err ? null : result.tokens!;
  const headers = new Headers(request.headers);
  headers.set(
    "cookie",
    withCookies(request.headers.get("cookie"), {
      [ACCESS_COOKIE]: tokens?.access ?? null,
      [REFRESH_COOKIE]: tokens?.refresh ?? null,
    }),
  );
  const response = NextResponse.next({ request: { headers } });
  const secure = protocol === "https:";
  if (tokens) {
    response.headers.append("Set-Cookie", tokenCookie(ACCESS_COOKIE, tokens.access, secure));
    response.headers.append("Set-Cookie", tokenCookie(REFRESH_COOKIE, tokens.refresh, secure));
  } else {
    // The refresh token was revoked or expired: sign out cleanly.
    response.headers.append("Set-Cookie", tokenCookie(ACCESS_COOKIE, "", secure, 0));
    response.headers.append("Set-Cookie", tokenCookie(REFRESH_COOKIE, "", secure, 0));
  }
  return response;
}

export const config = {
  // Built assets never need auth (on Cloudflare they're served before the Worker runs).
  matcher: ["/((?!assets/|favicon.ico).*)"],
};
