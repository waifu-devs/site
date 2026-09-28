import type { Metadata } from "next";
import { ThemeEditor } from "@/components/ThemeEditor";
import { getTheme } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Make a theme" };

export default async function NewThemePage() {
  const user = await requireUser();
  // Start from whatever the user is wearing now, so tweaking an existing look is easy.
  const base = await getTheme(user.theme_id);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <h1 className="rise text-3xl font-extrabold">Make a theme <span className="float inline-block text-accent">✦</span></h1>
      <ThemeEditor initial={base.colors} />
    </main>
  );
}
