import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, type User } from "./db";

export const SESSION_COOKIE = "wd_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Creates a session row and returns the raw token to put in the cookie. */
export async function createSession(userId: string): Promise<{ token: string; maxAge: number }> {
  const token = randomToken();
  await db()
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, unixepoch() + ?)")
    .bind(await sha256(token), userId, SESSION_TTL_SECONDS)
    .run();
  // Opportunistic cleanup so the table doesn't grow forever.
  await db().prepare("DELETE FROM sessions WHERE expires_at < unixepoch()").run();
  return { token, maxAge: SESSION_TTL_SECONDS };
}

export async function deleteSession(token: string): Promise<void> {
  await db().prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
}

export async function getUserFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  return db()
    .prepare(
      "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > unixepoch()",
    )
    .bind(await sha256(token))
    .first<User>();
}

/** The signed-in user for the current request, or null. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return getUserFromToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
