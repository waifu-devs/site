"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canUseTheme, db, UUID } from "./db";
import { deleteSession, requireUser, SESSION_COOKIE } from "./session";
import { parseVariant, TOKENS } from "./themes";

function text(form: FormData, key: string, max: number): string | null {
  const value = form.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

function url(form: FormData, key: string): string | null {
  const value = text(form, key, 200);
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(SESSION_COOKIE);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateProfile(form: FormData) {
  const user = await requireUser();
  await db()`
    UPDATE users SET
      display_name = ${text(form, "display_name", 60)},
      bio = ${text(form, "bio", 500)},
      pronouns = ${text(form, "pronouns", 30)},
      website = ${url(form, "website")},
      favorite_waifu = ${text(form, "favorite_waifu", 80)},
      updated_at = now()
    WHERE id = ${user.id}`;
  revalidatePath("/", "layout");
  redirect(`/u/${user.username}`);
}

export async function wearTheme(form: FormData) {
  const user = await requireUser();
  const themeId = text(form, "theme_id", 64);
  if (!themeId || !(await canUseTheme(user.id, themeId))) throw new Error("That theme isn't available.");
  await db()`UPDATE users SET theme_id = ${themeId}, updated_at = now() WHERE id = ${user.id}`;
  revalidatePath("/", "layout");
  redirect("/themes");
}

export async function createTheme(form: FormData) {
  const user = await requireUser();
  const name = text(form, "name", 40);
  const variant = parseVariant({
    tokens: Object.fromEntries(TOKENS.map((k) => [k, form.get(k)])),
    radius: Number(form.get("radius")),
  });
  if (!name || !variant) throw new Error("A theme needs a name and a valid color for every token.");

  await db().begin(async (sql) => {
    const [theme] = await sql<{ id: string }[]>`
      INSERT INTO themes (owner_id, name, description, variant, is_public)
      VALUES (${user.id}, ${name}, ${text(form, "description", 140)}, ${sql.json(variant)}, ${form.get("is_public") !== null})
      RETURNING id`;
    await sql`UPDATE users SET theme_id = ${theme.id}, updated_at = now() WHERE id = ${user.id}`;
  });
  revalidatePath("/", "layout");
  redirect("/themes");
}

export async function deleteTheme(form: FormData) {
  const user = await requireUser();
  const themeId = text(form, "theme_id", 64);
  if (!themeId || !UUID.test(themeId)) return;
  await db().begin(async (sql) => {
    const deleted = await sql`DELETE FROM themes WHERE id = ${themeId} AND owner_id = ${user.id} RETURNING id`;
    // Anyone wearing the deleted theme falls back to the default.
    if (deleted.length) await sql`UPDATE users SET theme_id = 'sakura' WHERE theme_id = ${themeId}`;
  });
  revalidatePath("/", "layout");
  redirect("/themes");
}
