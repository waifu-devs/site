/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Link, Outlet, Scripts, useMatch, useRouter } from "@tanstack/react-router";
import { DEFAULT_THEME, themeStyle } from "@waifu-devs/domain/themes";
import { domMax, LazyMotion, m as motion } from "motion/react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { UserAvatar } from "@/components/Avatar";
import { BugReportsFooter } from "@/components/BugReports";
import { Sparkles } from "@/components/motion";
import { Petals } from "@/components/Petals";
import { LanguageMenu, useSwitchingLanguage } from "@/components/LanguagePicker";
import { Button } from "@/components/ui/button";
import { loadCatalog } from "@/i18n/catalogs";
import { I18nProvider, type Messages, T, useI18n } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { pageChange, startReports } from "@/lib/reports";
import { getViewer } from "@/server/functions";
import appCss from "@/styles/app.css?url";
import fontsCss from "@/styles/fonts.css?url";

// The account menu (and the dropdown library under it) only matters to signed-in
// members, so visitors never download it.
const UserMenu = lazy(() => import("@/components/UserMenu").then((m) => ({ default: m.UserMenu })));

/** What the account menu looks like before its code arrives. */
function UserMenuTrigger({ username, name, avatar }: { username: string; name: string; avatar: string | null }) {
  return (
    <span className="flex items-center gap-2 rounded-full font-bold">
      <UserAvatar src={avatar} name={username} size={30} />
      <span className="hidden sm:inline">{name}</span>
    </span>
  );
}

export const Route = createRootRoute({
  // Every page is dressed in the viewer's theme, so the root always knows who's looking.
  // It also brings the page's language: the strings for anything but English, which every bundle has.
  loader: async () => {
    const viewer = await getViewer();
    const messages: Messages = viewer.language.active === "en" ? null : Object.fromEntries(await loadCatalog(viewer.language.active));
    return { ...viewer, messages };
  },
  head: ({ matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      title(),
      { name: "description", content: headT(matches)("common.meta.description") },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
});

/**
 * The rest of the site font (Japanese and every other script, about 100 KB of
 * @font-face rules). As media="print" it downloads without holding back the
 * first paint; once the page is up and idle it switches on. Until then,
 * non-Latin text uses a system font.
 */
function LateFonts() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof requestIdleCallback !== "function") return void setOn(true);
    const id = requestIdleCallback(() => setOn(true), { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }, []);
  return <link rel="stylesheet" href={fontsCss} media={on ? "all" : "print"} />;
}

/** The HTML document. It also renders error pages, so it can't count on the loader having run. */
function RootDocument({ children }: { children: ReactNode }) {
  const viewerTheme = useMatch({ from: "__root__", shouldThrow: false })?.loaderData?.theme ?? DEFAULT_THEME;
  // A profile dresses the whole page, header and all, in the theme its owner picked for it.
  const profileTheme = useMatch({ from: "/u/$username", shouldThrow: false })?.loaderData?.theme;
  const theme = profileTheme ?? viewerTheme;
  const viewer = useMatch({ from: "__root__", shouldThrow: false })?.loaderData;
  const locale = viewer?.language.active ?? "en";
  const dir = viewer?.language.dir ?? "ltr";
  return (
    <html lang={locale} dir={dir} data-theme={theme.id} style={themeStyle(theme.variant)}>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen">
        <I18nProvider locale={locale} dir={dir} messages={viewer?.messages ?? null}>
          <LazyMotion features={domMax}>{children}</LazyMotion>
        </I18nProvider>
        <LateFonts />
        <Scripts />
      </body>
    </html>
  );
}

/** Anonymous bug reports (lib/reports.ts): started once the page is up, and told of each page change. */
function useBugReports() {
  const router = useRouter();
  useEffect(() => {
    const current = () => router.state.matches.at(-1)?.routeId;
    startReports(current);
    pageChange(current(), 0);
    let started = 0;
    const before = router.subscribe("onBeforeNavigate", () => (started = performance.now()));
    const resolved = router.subscribe("onResolved", () => {
      if (started) pageChange(current(), performance.now() - started);
      started = 0;
    });
    return () => {
      before();
      resolved();
    };
  }, [router]);
}

function RootLayout() {
  const { user, language } = Route.useLoaderData();
  const { t } = useI18n();
  // While a new language's strings arrive, the page dims a little instead of jumping.
  const switching = useSwitchingLanguage() !== null;
  useBugReports();
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
                {t("common.nav.projects")}
              </Link>
              <Link to="/members" className="nav-link hover:text-primary" activeProps={{ className: "text-primary" }}>
                {t("common.nav.members")}
              </Link>
              <Link to="/themes" className="nav-link hover:text-primary" activeProps={{ className: "text-primary" }}>
                {t("common.nav.themes")}
              </Link>
              <Link to="/news" className="nav-link hover:text-primary" activeProps={{ className: "text-primary" }}>
                {t("common.nav.news")}
              </Link>
            </div>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <LanguageMenu language={language} />
              {user ? (
                <Suspense fallback={<UserMenuTrigger name={user.displayName ?? user.username} username={user.username} avatar={user.avatarUrl} />}>
                  <UserMenu username={user.username} name={user.displayName ?? user.username} avatar={user.avatarUrl} />
                </Suspense>
              ) : (
                <Button asChild size="sm" className="btn rounded-full font-bold">
                  <Link to="/login">{t("common.nav.signIn")}</Link>
                </Button>
              )}
            </div>
          </nav>
        </header>
        <motion.div className="flex-1" animate={{ opacity: switching ? 0.55 : 1 }} transition={{ duration: 0.12 }}>
          <Outlet />
        </motion.div>
        <footer className="flex flex-col gap-2 border-t py-6 text-center text-xs text-muted-foreground">
          <p>
            <T k="common.footer.madeWith" values={{ heart: "♡" }} /> ·{" "}
            <a className="underline hover:text-primary" href="https://github.com/waifu-devs">
              {t("common.footer.github")}
            </a>{" "}
            ·{" "}
            <a className="underline hover:text-primary" href="https://status.waifu.dev">
              {t("common.footer.status")}
            </a>
            {" "}
            ·{" "}
            <Link to="/stats" className="underline hover:text-primary">
              {t("common.footer.stats")}
            </Link>
          </p>
          <BugReportsFooter />
        </footer>
      </div>
    </>
  );
}

function NotFound() {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="float text-5xl">(╥﹏╥)</p>
      <h1 className="text-2xl font-extrabold">{t("common.notFound.title")}</h1>
      <p className="text-muted-foreground">{t("common.notFound.body")}</p>
      <Button asChild className="btn rounded-full font-bold">
        <Link to="/">{t("common.notFound.home")}</Link>
      </Button>
    </main>
  );
}
