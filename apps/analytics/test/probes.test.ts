import { isProbe } from "@waifu-devs/domain/probes";
import { describe, expect, it } from "vitest";

describe("isProbe", () => {
  it("catches scanners' guesses", () => {
    for (const path of [
      "/.env",
      "/.env.production",
      "/api/.env",
      "/config.env",
      "/.git/config",
      "/.DS_Store",
      "/.aws/credentials",
      "/.htaccess",
      "/wp-config.php",
      "/wp-config.php.bak",
      "/wp-login.php",
      "/wp-admin/",
      "/blog/wp-admin/setup-config.php",
      "/wordpress/wp-includes/wlwmanifest.xml",
      "/wp-json/wp/v2/users",
      "/xmlrpc.php",
      "/phpMyAdmin/",
      "/pma/",
      "/actuator/env",
      "/cgi-bin/luci",
      "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
      "/index.php?x=1",
      "/default.aspx",
      "/backup.sql",
      "/config.ini",
      "/HNAP1/",
      "/_ignition/execute-solution",
      "/server-status",
      "/%2eenv",
    ]) {
      expect(isProbe(path), path).toBe(true);
    }
  });

  it("lets every real path through", () => {
    for (const path of [
      "/",
      "/health",
      "/api/health",
      "/api/auth/callback?code=abc&state=def",
      "/api/reports",
      "/u/shixzie",
      "/news/123",
      "/themes/new",
      "/settings",
      "/projects",
      "/assets/index-abc123.js",
      "/authorize?client_id=web",
      "/token",
      "/github/authorize",
      "/github/callback?code=abc",
      "/.well-known/jwks.json",
      "/.well-known/oauth-authorization-server",
      "/media/avatar-0b8a3c1e-1234-4abc-9def-0123456789ab-0123456789abcdef.webp",
      "/consent/fonts/m-plus-rounded-1c-latin-400-normal.woff2",
      "/v1/fuwa/signals",
      "/v1/reports/summary",
    ]) {
      expect(isProbe(path), path).toBe(false);
    }
  });
});
