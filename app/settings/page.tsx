import type { Metadata } from "next";
import Link from "next/link";
import { updateProfile } from "@/lib/actions";
import { getTheme } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

const field = "w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none focus:border-accent";

export default async function SettingsPage() {
  const user = await requireUser();
  const theme = await getTheme(user.theme_id);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      <h1 className="text-3xl font-extrabold">Your profile</h1>

      <form action={updateProfile} className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-6">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Display name</span>
          <input className={field} name="display_name" maxLength={60} defaultValue={user.display_name ?? ""} placeholder={user.username} />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold">Pronouns</span>
            <input className={field} name="pronouns" maxLength={30} defaultValue={user.pronouns ?? ""} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold">Favorite waifu</span>
            <input className={field} name="favorite_waifu" maxLength={80} defaultValue={user.favorite_waifu ?? ""} placeholder="Best girl goes here" />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Website</span>
          <input className={field} name="website" maxLength={200} defaultValue={user.website ?? ""} placeholder="https://" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Bio</span>
          <textarea className={field} name="bio" maxLength={500} rows={5} defaultValue={user.bio ?? ""} />
        </label>
        <p className="text-xs text-muted">Your avatar and username come from GitHub and refresh each time you sign in.</p>
        <button type="submit" className="self-start rounded-full bg-accent px-6 py-2 font-bold text-on-accent hover:opacity-90">
          Save profile
        </button>
      </form>

      <section className="flex items-center justify-between gap-4 rounded-3xl border border-line bg-surface p-6">
        <div>
          <h2 className="font-bold">Theme</h2>
          <p className="text-sm text-muted">You're wearing <b className="text-ink">{theme.name}</b>. It styles the site for you and your profile for everyone.</p>
        </div>
        <Link href="/themes" className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-bold hover:border-accent">
          Change
        </Link>
      </section>
    </main>
  );
}
