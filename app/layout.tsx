import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Petals } from "@/components/Petals";
import { signOut } from "@/lib/actions";
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
    <html lang="en" style={themeStyle(theme.colors)}>
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
        <div className="relative z-10 flex min-h-screen flex-col">
          <header className="border-b border-line bg-surface/80 backdrop-blur">
            <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Link href="/" className="text-lg font-extrabold tracking-tight">
                <span className="text-accent">♡</span> Waifu Devs
              </Link>
              <div className="flex gap-4 text-sm font-bold text-muted">
                <Link href="/members" className="hover:text-accent">Members</Link>
                <Link href="/themes" className="hover:text-accent">Themes</Link>
              </div>
              <div className="ml-auto flex items-center gap-3 text-sm">
                {user ? (
                  <>
                    <Link href={`/u/${user.username}`} className="flex items-center gap-2 font-bold hover:text-accent">
                      <Avatar src={user.avatar_url} name={user.username} size={28} />
                      <span className="hidden sm:inline">{user.display_name ?? user.username}</span>
                    </Link>
                    <Link href="/settings" className="text-muted hover:text-accent">Settings</Link>
                    <form action={signOut}>
                      <button className="cursor-pointer text-muted hover:text-accent" type="submit">Sign out</button>
                    </form>
                  </>
                ) : (
                  <Link href="/login" className="rounded-full bg-accent px-4 py-1.5 font-bold text-on-accent hover:opacity-90">
                    Sign in
                  </Link>
                )}
              </div>
            </nav>
          </header>
          <div className="flex-1">{children}</div>
          <footer className="border-t border-line py-6 text-center text-xs text-muted">
            Made with ♡ by the Waifu Devs community ·{" "}
            <a className="underline hover:text-accent" href="https://github.com/waifu-devs">GitHub</a>
          </footer>
        </div>
      </body>
    </html>
  );
}
