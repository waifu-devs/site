/**
 * The security headers every response from the web server carries, and the
 * Content-Security-Policy its pages get. Kept free of server-only imports:
 * vite.config.ts and the server entry both read it.
 */

/** Largest request body the server reads: a picture upload (5 MB) plus the form around it. */
export const MAX_BODY_BYTES = 6 * 1024 * 1024;

/**
 * For every response, static files included (vite.config.ts hands them to Nitro):
 * HTTPS only from now on, no sniffing content types, never framed, and no
 * referrer sent anywhere, so following a link off the site doesn't tell the
 * other end which page (a profile, a post) someone came from.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

/**
 * What a page may load: scripts only from here (TanStack Start's inline
 * hydration scripts carry the per-request nonce), pictures from here and the
 * API's /media, nothing third-party at all. Styles may be inline: themes are
 * inline CSS variables, and the motion components animate style attributes.
 */
export function contentSecurityPolicy({ nonce, apiOrigin }: { nonce?: string; apiOrigin: string }): string {
  return [
    "default-src 'self'",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${apiOrigin}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");
}
