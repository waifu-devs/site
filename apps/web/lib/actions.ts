"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { canUseTheme, db, UUID } from "./db";
import { themes, users } from "./schema";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./auth/client";
import { revokeRefreshToken } from "./auth/storage";
import { requireUser } from "./session";
import { DEFAULT_THEME, parseVariant, TOKENS } from "./themes";

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
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (refresh) await revokeRefreshToken(db(), refresh);
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateProfile(form: FormData) {
  const user = await requireUser();
  await db()
    .update(users)
    .set({
      displayName: text(form, "display_name", 60),
      bio: text(form, "bio", 500),
      pronouns: text(form, "pronouns", 30),
      website: url(form, "website"),
      favoriteWaifu: text(form, "favorite_waifu", 80),
    })
    .where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  redirect(`/u/${user.username}`);
}

export async function wearTheme(form: FormData) {
  const user = await requireUser();
  const themeId = text(form, "theme_id", 64);
  if (!themeId || !(await canUseTheme(user.id, themeId))) throw new Error("That theme isn't available.");
  await db().update(users).set({ themeId }).where(eq(users.id, user.id));
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

  await db().transaction(async (tx) => {
    const [theme] = await tx
      .insert(themes)
      .values({
        ownerId: user.id,
        name,
        description: text(form, "description", 140),
        variant,
        isPublic: form.get("is_public") !== null,
      })
      .returning({ id: themes.id });
    await tx.update(users).set({ themeId: theme.id }).where(eq(users.id, user.id));
  });
  revalidatePath("/", "layout");
  redirect("/themes");
}

export async function deleteTheme(form: FormData) {
  const user = await requireUser();
  const themeId = text(form, "theme_id", 64);
  if (!themeId || !UUID.test(themeId)) return;
  await db().transaction(async (tx) => {
    const deleted = await tx
      .delete(themes)
      .where(and(eq(themes.id, themeId), eq(themes.ownerId, user.id)))
      .returning({ id: themes.id });
    // Anyone wearing the deleted theme falls back to the default.
    if (deleted.length) await tx.update(users).set({ themeId: DEFAULT_THEME.id }).where(eq(users.themeId, themeId));
  });
  revalidatePath("/", "layout");
  redirect("/themes");
}
