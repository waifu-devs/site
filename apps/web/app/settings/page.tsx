import type { Metadata } from "next";
import Link from "next/link";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateProfile } from "@/lib/actions";
import { getTheme } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

const lift = "transition-all duration-200 focus-visible:-translate-y-0.5";

export default async function SettingsPage() {
  const user = await requireUser();
  const theme = await getTheme(user.themeId);

  return (
    <main className="stagger mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      <h1 className="text-3xl font-extrabold">Your profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Shown on <Link className="text-primary hover:underline" href={`/u/${user.username}`}>u/{user.username}</Link>.
            Your avatar and username come from GitHub and refresh each time you sign in.
          </CardDescription>
        </CardHeader>
        <form action={updateProfile}>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="display_name">Display name</Label>
              <Input className={lift} id="display_name" name="display_name" maxLength={60} defaultValue={user.displayName ?? ""} placeholder={user.username} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="pronouns">Pronouns</Label>
                <Input className={lift} id="pronouns" name="pronouns" maxLength={30} defaultValue={user.pronouns ?? ""} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="favorite_waifu">Favorite waifu</Label>
                <Input className={lift} id="favorite_waifu" name="favorite_waifu" maxLength={80} defaultValue={user.favoriteWaifu ?? ""} placeholder="Best girl goes here" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="website">Website</Label>
              <Input className={lift} id="website" name="website" maxLength={200} defaultValue={user.website ?? ""} placeholder="https://" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea className={lift} id="bio" name="bio" maxLength={500} rows={5} defaultValue={user.bio ?? ""} />
            </div>
          </CardContent>
          <CardFooter className="pt-6">
            <Button type="submit" className="btn rounded-full font-bold">Save profile</Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            You're wearing <b className="text-foreground">{theme.name}</b>. It styles the site for you and your profile for everyone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="w-48"><ThemeSwatch theme={theme} /></div>
          <Button asChild variant="outline" className="btn rounded-full font-bold">
            <Link href="/themes">Change theme</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
