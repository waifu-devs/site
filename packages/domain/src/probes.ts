/**
 * Requests from scanners looking for software the site isn't (WordPress,
 * phpMyAdmin, Spring's actuator, a stray `.env` or `.git`). The web server, the
 * api and analytics turn them away with a plain 404 before anything routes or
 * logs them, and nothing about them is kept, the sender's address least of all.
 * Railway's edge turns most of them away first (`.railway/edge-rules.json`);
 * this is the same list, for anything the edge lets through.
 */

/** Endings no address of ours ever has. */
const ENDINGS = [
  ".php",
  ".php3",
  ".php4",
  ".php5",
  ".php7",
  ".phtml",
  ".asp",
  ".aspx",
  ".ashx",
  ".asmx",
  ".axd",
  ".jsp",
  ".jspx",
  ".cgi",
  ".sql",
  ".bak",
  ".env",
  ".ini",
];

/** Folders other software keeps, wherever in a path they turn up. */
const ANYWHERE = new Set(["wp-admin", "wp-content", "wp-includes", "wp-json", "phpmyadmin"]);

/** First folders of paths other software answers. */
const FIRST = new Set([
  "actuator",
  "adminer",
  "autodiscover",
  "boaform",
  "cgi-bin",
  "hnap1",
  "myadmin",
  "pma",
  "server-status",
  "solr",
  "telescope",
  "vendor",
  "xmlrpc",
  "_ignition",
]);

/** The body and headers probes get: a 404 Railway's CDN may keep for a day, so a scanner trying again stops at the edge. */
export const PROBE_RESPONSE = {
  status: 404,
  body: "not found\n",
  headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
} as const;

/** Whether `path` (a URL's path, with or without its query) is one only a scanner asks for. `/.well-known/` stays open (OpenAuth's keys are there). */
export function isProbe(path: string): boolean {
  let decoded = path.split("?")[0] ?? "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Broken escapes: judge the path as sent.
  }
  const segments = decoded.toLowerCase().split("/").filter(Boolean);
  if (segments[0] === ".well-known") return false;
  return segments.some(
    (segment, i) =>
      // Hidden files and folders: .env, .git, .DS_Store, .aws, .htaccess...
      segment.startsWith(".") || ENDINGS.some((ending) => segment.endsWith(ending)) || ANYWHERE.has(segment) || (i === 0 && FIRST.has(segment)),
  );
}
