import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Asking before an app other than the web app learns who you are.
 *
 * GitHub approves a returning member's sign-in without a word, so without
 * this any site could send a signed-in visitor through /authorize (as a fuwa
 * "server" whose address is its own) and learn their waifu.dev account without
 * them noticing. So the first time /authorize sees such an app, it answers
 * with a page here asking whether to go on. Continue is the same /authorize
 * address plus `consent`: an HMAC over that exact request, an expiry and a
 * random nonce whose other half is in a SameSite=Strict cookie set with the
 * page. The cookie only comes along when the click starts on this site, so
 * neither the page's address nor a forged link gets anyone past it, and it's
 * cleared once used. The page can't be framed, so it can't be clicked blind.
 */

/** Long enough to read the page and decide; the sign-in itself expires on its own. */
const CONSENT_TTL_SECONDS = 10 * 60;
const COOKIE = "wd_consent";
const PARAM = "consent";

export type ConsentCheck =
  /** Show the page (with its cookie). */
  | { readonly kind: "ask"; readonly response: Response }
  /** Go on with this request (the consent param removed), and clear the cookie on the response. */
  | { readonly kind: "consented"; readonly url: URL; readonly clearCookie: string };

export function makeConsent({ secret, secure }: { secret: string; secure: boolean }) {
  // A key of its own, so a consent can't be mistaken for anything else signed with the secret.
  const key = createHmac("sha256", secret).update("waifu.dev linked sign-in consent v1").digest();
  const sign = (nonce: string, expires: number, request: string) =>
    createHmac("sha256", key).update(`${nonce}\n${expires}\n${request}`).digest("base64url");
  const cookie = (value: string, maxAge: number) =>
    `${COOKIE}=${value}; Path=/authorize; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;

  /** The sign-in request as signed: the query without the consent itself, in the order it came. */
  const signed = (url: URL) => {
    const params = new URLSearchParams(url.search);
    params.delete(PARAM);
    return params.toString();
  };

  const valid = (request: Request, url: URL) => {
    const [expires, signature] = (url.searchParams.get(PARAM) ?? "").split(".");
    const nonce = cookieValue(request.headers.get("cookie"), COOKIE);
    if (!nonce || !signature || !/^\d+$/.test(expires) || Number(expires) < Date.now() / 1000) return false;
    const expected = Buffer.from(sign(nonce, Number(expires), signed(url)));
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  /** Whether `request` (an /authorize for `clientID`, already allowed) may go on, or the page to show. */
  const check = (request: Request, url: URL, clientID: string): ConsentCheck => {
    if (valid(request, url)) {
      const consented = new URL(url);
      consented.searchParams.delete(PARAM);
      return { kind: "consented", url: consented, clearCookie: cookie("", 0) };
    }
    const nonce = randomBytes(18).toString("base64url");
    const expires = Math.floor(Date.now() / 1000) + CONSENT_TTL_SECONDS;
    const query = signed(url);
    const proceed = `/authorize?${query}${query ? "&" : ""}${PARAM}=${expires}.${sign(nonce, expires, query)}`;
    const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("error_description", "You chose not to sign in with waifu.dev.");
    const state = url.searchParams.get("state");
    if (state) redirect.searchParams.set("state", state);
    const styleNonce = randomBytes(16).toString("base64");
    return {
      kind: "ask",
      response: new Response(page({ app: new URL(clientID), proceed, cancel: redirect.href, styleNonce }), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "set-cookie": cookie(nonce, CONSENT_TTL_SECONDS),
          "content-security-policy": [
            "default-src 'none'",
            `style-src 'nonce-${styleNonce}'`,
            "font-src 'self'",
            "img-src 'self'",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
          ].join("; "),
        },
      }),
    };
  };

  return { check } as const;
}

function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The site's font, for this page (Latin is all it needs). The web app bundles its own copy.

const FONT_WEIGHTS = ["400", "800"] as const;
const fonts = new Map<string, Promise<Uint8Array>>();

/** The font file at /consent/fonts/<weight>.woff2, or undefined for anything else. */
export function consentFont(file: string): Promise<Uint8Array> | undefined {
  const weight = FONT_WEIGHTS.find((w) => file === `${w}.woff2`);
  if (!weight) return undefined;
  let font = fonts.get(weight);
  if (!font) {
    // Resolved from node_modules at runtime, next to the bundle (like sharp).
    font = readFile(fileURLToPath(import.meta.resolve(`@fontsource/m-plus-rounded-1c/files/m-plus-rounded-1c-latin-${weight}-normal.woff2`)));
    fonts.set(weight, font);
  }
  return font;
}

// ---------------------------------------------------------------------------

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The page, in the site's Sakura theme and font. No scripts: the motion is CSS
 * (the card rises in, the two ends of the sign-in are joined by a running
 * wire, buttons lift and press), and all of it stops for reduced motion.
 */
function page({ app, proceed, cancel, styleNonce }: { app: URL; proceed: string; cancel: string; styleNonce: string }) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname);
  const host = escape(app.host);
  const who = local ? `A fuwa server on this computer (<b>${host}</b>)` : `<b>${host}</b>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Sign in to ${host} · Waifu Devs</title>
<style nonce="${styleNonce}">
@font-face { font-family: "M PLUS Rounded 1c"; font-weight: 400; font-display: swap; src: url(/consent/fonts/400.woff2) format("woff2"); }
@font-face { font-family: "M PLUS Rounded 1c"; font-weight: 800; font-display: swap; src: url(/consent/fonts/800.woff2) format("woff2"); }
:root {
  --background: #fff5f8; --foreground: #3b2330; --card: #ffffff; --primary: #f06292; --primary-foreground: #ffffff;
  --muted: #fbe5ec; --muted-foreground: #8a6577; --border: #f8d3e0; --radius: 1rem;
  --spring: cubic-bezier(0.3, 1.6, 0.5, 1); --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; overflow-x: clip; }
body {
  min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
  font-family: "M PLUS Rounded 1c", ui-rounded, ui-sans-serif, system-ui, sans-serif;
  background: radial-gradient(60rem 40rem at 50% -10%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 70%), var(--background);
  color: var(--foreground);
}
.petals { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.petals span {
  position: absolute; top: -24px; width: 12px; height: 9px; border-radius: 12px 0;
  background: color-mix(in srgb, var(--primary) 35%, white); opacity: 0.7;
  animation: fall 16s linear infinite;
}
.petals span:nth-child(1) { left: 12%; animation-delay: -2s; }
.petals span:nth-child(2) { left: 34%; animation-delay: -9s; animation-duration: 19s; }
.petals span:nth-child(3) { left: 66%; animation-delay: -5s; animation-duration: 15s; }
.petals span:nth-child(4) { left: 88%; animation-delay: -12s; animation-duration: 21s; }
@keyframes fall { to { transform: translate(-60px, 110vh) rotate(540deg); } }
main {
  position: relative; width: 100%; max-width: 26rem; padding: 32px 28px 26px; text-align: center;
  background: var(--card); border: 1px solid var(--border); border-radius: calc(var(--radius) + 8px);
  box-shadow: 0 24px 60px -32px color-mix(in srgb, var(--primary) 70%, transparent);
  animation: rise 0.7s var(--ease) both;
}
main > * { animation: rise 0.7s var(--ease) both; }
main > :nth-child(2) { animation-delay: 0.06s; } main > :nth-child(3) { animation-delay: 0.12s; }
main > :nth-child(4) { animation-delay: 0.18s; } main > :nth-child(5) { animation-delay: 0.24s; }
main > :nth-child(6) { animation-delay: 0.3s; }
@keyframes rise { from { opacity: 0; transform: translateY(14px) scale(0.98); } }
.link { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0 0 22px; }
.end {
  display: grid; place-items: center; width: 56px; height: 56px; flex: none; border-radius: 18px;
  font-size: 26px; font-weight: 800; border: 2px solid var(--border); background: var(--muted);
  transition: transform 0.35s var(--spring);
}
.end.us { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
.end.us span { display: inline-block; animation: heartbeat 1.8s ease-in-out infinite; }
.end:hover { transform: translateY(-3px) rotate(-6deg); }
.wire { position: relative; width: 72px; height: 4px; border-radius: 9999px; overflow: hidden; background: var(--border); }
.wire::after {
  content: ""; position: absolute; inset-block: 0; left: 0; width: 45%; border-radius: inherit;
  background: linear-gradient(90deg, transparent, var(--primary), transparent);
  animation: run 1.6s ease-in-out infinite;
}
@keyframes run { from { translate: -100% 0; } to { translate: 250% 0; } }
@keyframes heartbeat { 0%, 100% { transform: scale(1); } 15% { transform: scale(1.18); } 30% { transform: scale(1); } 45% { transform: scale(1.12); } }
h1 { margin: 0 0 10px; font-size: 1.45rem; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; }
h1 b { color: var(--primary); }
p { margin: 0 0 14px; color: var(--muted-foreground); line-height: 1.6; }
ul {
  margin: 0 0 22px; padding: 12px 16px; list-style: none; text-align: left; font-size: 0.92rem;
  background: var(--background); border: 1px dashed var(--border); border-radius: var(--radius);
}
li { display: flex; gap: 8px; padding: 3px 0; }
li::before { content: "♡"; color: var(--primary); }
li.no::before { content: "✕"; color: var(--muted-foreground); }
.actions { display: flex; flex-direction: column; gap: 10px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 22px;
  border-radius: 9999px; font: inherit; font-weight: 800; text-decoration: none;
  transition: transform 0.18s var(--spring), box-shadow 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}
.btn:hover { transform: translateY(-2px); }
.btn:active { transform: translateY(0) scale(0.94); }
.btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 50%, transparent); outline-offset: 2px; }
.go { background: var(--primary); color: var(--primary-foreground); }
.go:hover { box-shadow: 0 8px 22px -8px var(--primary); }
.go .arrow { display: inline-block; transition: transform 0.25s var(--spring); }
.go:hover .arrow { transform: translateX(4px); }
.stop { color: var(--muted-foreground); }
.stop:hover { color: var(--foreground); background: var(--muted); }
small { display: block; margin-top: 16px; font-size: 0.75rem; color: var(--muted-foreground); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .petals { display: none; }
}
</style>
</head>
<body>
<div class="petals" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
<main>
  <div class="link" aria-hidden="true">
    <div class="end">✿</div>
    <div class="wire"></div>
    <div class="end us"><span>♡</span></div>
  </div>
  <h1>${who} wants to sign you in with your waifu.dev account</h1>
  <p>Only continue if you were signing in there just now.</p>
  <ul>
    <li>It learns your username, display name, picture and profile link</li>
    <li class="no">It can't post, change or see anything else here</li>
  </ul>
  <div class="actions">
    <a class="btn go" href="${escape(proceed)}">Continue <span class="arrow">→</span></a>
    <a class="btn stop" href="${escape(cancel)}">Cancel</a>
  </div>
  <small>${escape(app.origin)}</small>
</main>
</body>
</html>`;
}
