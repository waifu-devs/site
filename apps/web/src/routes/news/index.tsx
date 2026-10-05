import { createFileRoute, Link } from "@tanstack/react-router";
import type { PostSort } from "@waifu-devs/domain/api";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Magnetic } from "@/components/animate-ui/primitives/effects/magnetic";
import { PostRow } from "@/components/news/PostRow";
import { SortTabs } from "@/components/news/SortTabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { useViewer } from "@/lib/viewer";
import { getNews } from "@/server/news";

/** Matches the API's page size, to number posts across pages. */
const PAGE_SIZE = 30;

const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

type Search = { sort?: "new"; page?: number };

export const Route = createFileRoute("/news/")({
  // "top" and page 1 are the defaults, so they stay out of the URL.
  validateSearch: (search: Record<string, unknown>): Search => {
    const page = Number(search.page);
    return {
      ...(search.sort === "new" ? { sort: "new" as const } : {}),
      ...(Number.isInteger(page) && page > 1 && page <= 100 ? { page } : {}),
    };
  },
  loaderDeps: ({ search }) => ({ sort: (search.sort ?? "top") as PostSort, page: search.page ?? 1 }),
  loader: ({ deps }) => getNews({ data: deps }),
  head: ({ match, matches }) => ({ meta: [title(headT(matches)(match.search.sort === "new" ? "news.titleNew" : "news.title"))] }),
  component: NewsPage,
});

function NewsPage() {
  const { posts, hasMore } = Route.useLoaderData();
  const { sort = "top", page = 1 } = Route.useSearch();
  const { user } = useViewer();
  const { t } = useI18n();
  const offset = (page - 1) * PAGE_SIZE;
  const submit = user ? (
    <Link to="/news/submit">
      <Plus /> {t("news.index.submit")}
    </Link>
  ) : (
    <Link to="/login" search={{ next: "/news/submit" }}>
      <Plus /> {t("news.index.submit")}
    </Link>
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <header data-sparkle-zone className="relative isolate">
        {/* The glows drift past the content edges; this screen-wide layer clips them at the
            screen's edges, so they never make the page wider than a phone. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-x-clip">
          <div className="relative mx-auto h-full max-w-3xl px-4">
            <div className="blob -left-16 -top-24 h-64 w-64" />
            <div className="blob b2 -top-10 right-4 h-44 w-44" />
          </div>
        </div>
        <div className="stagger flex flex-col gap-2">
          <p className="float w-fit text-2xl text-primary">(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            <span className="gradient-text">{t("news.index.heading")}</span>
          </h1>
          <p className="max-w-xl text-muted-foreground">
            {t("news.index.lede")}
          </p>
        </div>
      </header>

      <div className="rise flex items-center justify-between gap-3">
        <SortTabs sort={sort} />
        <Magnetic strength={0.3}>
          <Button asChild className="btn rounded-full font-bold">
            {submit}
          </Button>
        </Magnetic>
      </div>

      {posts.length ? (
        <ol className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {posts.map((post, i) => (
              <motion.li
                key={post.id}
                // Switching Top/New slides the posts both lists share into their new places.
                layout="position"
                initial={{ opacity: 0, y: 18, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                transition={{ default: { ...spring, delay: Math.min(i, 12) * 0.03 }, layout: spring }}
                className="group relative overflow-hidden rounded-2xl border bg-card/80 p-3 backdrop-blur transition-[border-color,box-shadow] duration-300 before:absolute before:top-1/2 before:left-0 before:h-0 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-primary before:transition-[height] before:duration-300 hover:border-primary hover:shadow-[0_18px_40px_-24px_var(--primary)] hover:before:h-2/3 sm:p-4"
              >
                <PostRow post={post} rank={offset + i + 1} viewerUsername={user?.username ?? null} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      ) : (
        <Card className="rise items-center gap-3 px-6 py-14 text-center">
          <p className="float text-5xl">(・_・;)</p>
          <h2 className="text-xl font-extrabold">{page > 1 ? t("news.index.endTitle") : t("news.index.emptyTitle")}</h2>
          <p className="max-w-sm text-muted-foreground">
            {page > 1 ? t("news.index.endBody") : t("news.index.emptyBody")}
          </p>
          <Button asChild className="btn mt-2 rounded-full font-bold">
            {submit}
          </Button>
        </Card>
      )}

      {page > 1 || hasMore ? (
        <nav aria-label={t("news.index.pages")} className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Button asChild variant="outline" className="btn group rounded-full font-bold">
              <Link to="/news" search={{ ...(sort === "new" ? { sort } : {}), ...(page > 2 ? { page: page - 1 } : {}) }}>
                <ArrowLeft className="transition-transform group-hover:-translate-x-1" /> {t("news.index.back")}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {hasMore ? (
            <Button asChild variant="outline" className="btn group rounded-full font-bold">
              <Link to="/news" search={{ ...(sort === "new" ? { sort } : {}), page: page + 1 }}>
                {t("news.index.more")} <ArrowRight className="transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
