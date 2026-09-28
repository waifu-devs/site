import { createClient, type Client } from "@openauthjs/openauth/client";
import { CLIENT_ID, handleIssuer } from "./issuer";

export const ACCESS_COOKIE = "wd_access";
export const REFRESH_COOKIE = "wd_refresh";
/** Matches OpenAuth's refresh token lifetime; the access token inside expires sooner. */
export const TOKEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const clients = new Map<string, Client>();

/**
 * The OpenAuth client for this site, where `origin` is the issuer (the site
 * itself). Its requests go straight to the in-Worker issuer instead of back out
 * over the network. Cached so the signing keys are only read once per isolate.
 */
export function authClient(origin: string): Client {
  let client = clients.get(origin);
  if (!client) {
    if (clients.size > 8) clients.clear();
    client = createClient({
      clientID: CLIENT_ID,
      issuer: origin,
      fetch: (input, init) => handleIssuer(new Request(input, init)),
    });
    clients.set(origin, client);
  }
  return client;
}

export function tokenCookie(name: string, value: string, secure: boolean, maxAge = TOKEN_COOKIE_MAX_AGE): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
