/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Link, Outlet, Scripts, useMatch } from "@tanstack/react-router";
import { DEFAULT_THEME, themeStyle } from "@waifu-devs/domain/themes";
import type { ReactNode } from "react";
import { Sparkles } from "@/components/motion";
import { Petals } from "@/components/Petals";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import { title } from "@/lib/head";
import { getViewer } from "@/server/functions";
import appCss from "@/styles/app.css?url";

export const Route = createRootRoute({
  // Every page is dressed in the viewer's theme, so the root always knows who's looking.
  loader: () => getViewer(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      title(),
      { name: "description", content: "A cozy community for developers who love anime, waifus, and shipping code. (✿◕‿◕✿)" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
});

/** The HTML document. It also renders error pages, so it can't count on the loader having run. */
function RootDocument({ children }: { children: ReactNode }) {
  const viewerTheme = useMatch({ from: "__root__", shouldThrow: false })?.loaderData?.theme ?? DEFAULT_THEME;
  // A profile dresses the whole page, header and all, in the theme its owner picked for it.
  const profileTheme = useMatch({ from: "/u/$username", shouldThrow: false })?.loaderData?.theme;
  const theme = profileTheme ?? viewerTheme;
  return (
    <html lang="en" data-theme={theme.id} style={themeStyle(theme.variant)}>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  const { user } = Route.useLoaderData();
  return (
    <>
      <Petals />
      <Sparkles />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b bg-card/75 backdrop-blur-md">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link to="/" className="group shrink-0 text-lg font-extrabold tracking-tight">
              <span className="heartbeat text-primary">♡</span> Waifu Devs
            </Link>
            {/* On phones the links drop to their own row so Sign in never gets pushed off screen. */}
            <div className="order-last flex w-full gap-4 text-sm font-bold text-muted-foreground sm:order-none sm:w-auto">
              <Link to="/projects" className="nav-link hover:text-primary" activeProps={{ className: "text-primary" }}>
                Projects
              </Link>
              <Link to="/members" className="nav-link hover:text-primary" activeProps={{ className: "text-primary" }}>
                Members
              </Link>
              <Link to="/themes" className="nav-link hover:text-primary" activeProps={{ className: "text-primary" }}>
                Themes
              </Link>
              <Link to="/news" className="nav-link hover:text-primary" activeProps={{ className: "text-primary" }}>
                News
              </Link>
            </div>
            <div className="ml-auto flex items-center gap-3 text-sm">
              {user ? (
                <UserMenu username={user.username} name={user.displayName ?? user.username} avatar={user.avatarUrl} />
              ) : (
                <Button asChild size="sm" className="btn rounded-full font-bold">
                  <Link to="/login">Sign in</Link>
                </Button>
              )}
            </div>
          </nav>
        </header>
        <div className="flex-1">
          <Outlet />
        </div>
        <footer className="border-t py-6 text-center text-xs text-muted-foreground">
          Made with ♡ by the Waifu Devs community ·{" "}
          <a className="underline hover:text-primary" href="https://github.com/waifu-devs">
            GitHub
          </a>
        </footer>
      </div>
    </>
  );
}

function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="float text-5xl">(╥﹏╥)</p>
      <h1 className="text-2xl font-extrabold">Nothing here</h1>
      <p className="text-muted-foreground">That page wandered off. Maybe it went to get boba.</p>
      <Button asChild className="btn rounded-full font-bold">
        <Link to="/">Back home</Link>
      </Button>
    </main>
  );
}
