/** Short-lived cookie holding the sign-in state, PKCE verifier and destination. */
export const LOGIN_COOKIE = "wd_login";

/** Only allow same-site relative paths, so `next` can't be used as an open redirect. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/settings";
}
