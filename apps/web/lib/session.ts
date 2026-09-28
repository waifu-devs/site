import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, authClient } from "./auth/client";
import { subjects } from "./auth/subjects";
import { getUserById, UUID, type User } from "./db";

/** Reads `iss` from a JWT without checking it; verify() does the checking. */
function tokenIssuer(token: string): string | null {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const iss = (JSON.parse(atob(payload)) as { iss?: unknown }).iss;
    return typeof iss === "string" && URL.canParse(iss) ? iss : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in user for the current request, or null. proxy.ts has already
 * refreshed an expired access token, so this only verifies it.
 */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  // The issuer is this site, so the token must name the host it was sent to.
  const issuer = tokenIssuer(token);
  if (!issuer || new URL(issuer).host !== (await headers()).get("host")) return null;

  const verified = await authClient(issuer).verify(subjects, token);
  if (verified.err || verified.subject.type !== "user") return null;
  const { id } = verified.subject.properties;
  return UUID.test(id) ? getUserById(id) : null;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
