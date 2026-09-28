"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canUseTheme, db, newId } from "./db";
import { deleteSession, requireUser, SESSION_COOKIE } from "./session";
import { parseColors, THEME_KEYS } from "./themes";

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
  await db()
    .prepare(
      `UPDATE users SET display_name = ?, bio = ?, pronouns = ?, website = ?, favorite_waifu = ?, updated_at = unixepoch()
       WHERE id = ?`,
    )
    .bind(
      text(form, "display_name", 60),
      text(form, "bio", 500),
      text(form, "pronouns", 30),
      url(form, "website"),
      text(form, "favorite_waifu", 80),
      user.id,
    )
    .run();
  revalidatePath("/", "layout");
  redirect(`/u/${user.username}`);
}

export async function wearTheme(form: FormData) {
  const user = await requireUser();
  const themeId = text(form, "theme_id", 64);
  if (!themeId || !(await canUseTheme(user.id, themeId))) throw new Error("That theme isn't available.");
  await db().prepare("UPDATE users SET theme_id = ?, updated_at = unixepoch() WHERE id = ?").bind(themeId, user.id).run();
  revalidatePath("/", "layout");
  redirect("/themes");
}

export async function createTheme(form: FormData) {
  const user = await requireUser();
  const name = text(form, "name", 40);
  const colors = parseColors(Object.fromEntries(THEME_KEYS.map((k) => [k, form.get(k)])));
  if (!name || !colors) throw new Error("A theme needs a name and seven valid colors.");

  const id = newId();
  await db().batch([
    db()
      .prepare("INSERT INTO themes (id, owner_id, name, description, colors, is_public) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, user.id, name, text(form, "description", 140), JSON.stringify(colors), form.get("is_public") ? 1 : 0),
    db().prepare("UPDATE users SET theme_id = ?, updated_at = unixepoch() WHERE id = ?").bind(id, user.id),
  ]);
  revalidatePath("/", "layout");
  redirect("/themes");
}

export async function deleteTheme(form: FormData) {
  const user = await requireUser();
  const themeId = text(form, "theme_id", 64);
  if (!themeId) return;
  await db().batch([
    db().prepare("DELETE FROM themes WHERE id = ? AND owner_id = ?").bind(themeId, user.id),
    // Anyone wearing a theme that no longer exists falls back to the default.
    db().prepare("UPDATE users SET theme_id = 'sakura' WHERE theme_id = ? AND NOT EXISTS (SELECT 1 FROM themes WHERE id = ?)").bind(themeId, themeId),
  ]);
  revalidatePath("/", "layout");
  redirect("/themes");
}
