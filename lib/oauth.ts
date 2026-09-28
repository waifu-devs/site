export const OAUTH_STATE_COOKIE = "wd_oauth_state";

/** Only allow same-site relative paths, so `next` can't be used as an open redirect. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/settings";
}
