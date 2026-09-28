import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "@/components/motion";
import { Petals } from "@/components/Petals";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import { getTheme } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { themeStyle } from "@/lib/themes";
import "./globals.css";

// Every page reads the session cookie to pick the viewer's theme, so nothing is static.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Waifu Devs", template: "%s · Waifu Devs" },
  description: "A cozy community for developers who love anime, waifus, and shipping code. (✿◕‿◕✿)",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  const theme = await getTheme(user?.theme_id);

  return (
    <html lang="en" data-theme={theme.id} style={themeStyle(theme.variant)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700;800&display=swap"
        />
      </head>
      <body className="min-h-screen">
          <Petals />
          <Sparkles />
          <div className="relative z-10 flex min-h-screen flex-col">
            <header className="sticky top-0 z-40 border-b bg-card/75 backdrop-blur-md">
              <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
                <Link href="/" className="group shrink-0 text-lg font-extrabold tracking-tight">
                  <span className="heartbeat text-primary">♡</span> Waifu Devs
                </Link>
                <div className="flex gap-4 text-sm font-bold text-muted-foreground">
                  <Link href="/members" className="nav-link hover:text-primary">Members</Link>
                  <Link href="/themes" className="nav-link hover:text-primary">Themes</Link>
                </div>
                <div className="ml-auto flex items-center gap-3 text-sm">
                  {user ? (
                    <UserMenu username={user.username} name={user.display_name ?? user.username} avatar={user.avatar_url} />
                  ) : (
                    <Button asChild size="sm" className="btn rounded-full font-bold">
                      <Link href="/login">Sign in</Link>
                    </Button>
                  )}
                </div>
              </nav>
            </header>
            <div className="flex-1">{children}</div>
            <footer className="border-t py-6 text-center text-xs text-muted-foreground">
              Made with ♡ by the Waifu Devs community ·{" "}
              <a className="underline hover:text-primary" href="https://github.com/waifu-devs">GitHub</a>
            </footer>
          </div>
      </body>
    </html>
  );
}
