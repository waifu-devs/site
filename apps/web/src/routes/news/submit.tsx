import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { POST_BODY_MAX, POST_TITLE_MAX, POST_URL_MAX, type Post } from "@waifu-devs/domain/api";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { MarkdownField } from "@/components/MarkdownField";
import { PostRow } from "@/components/news/PostRow";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useI18n } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { cn } from "@/lib/utils";
import { getAccount } from "@/server/functions";
import { submitPost } from "@/server/news";

export const Route = createFileRoute("/news/submit")({
  loader: () => getAccount({ data: "/news/submit" }),
  head: ({ matches }) => ({ meta: [title(headT(matches)("news.titleSubmit"))] }),
  component: SubmitPage,
});

const open = { height: "auto", opacity: 1 };
const shut = { height: 0, opacity: 0 };

/** The link as the server will save it ("github.com/x" gets https://), or false if it can't be one. */
function normalizeUrl(value: string): string | null | false {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") ? url.toString() : false;
  } catch {
    return false;
  }
}

/** A ring that fills as the title gets longer, and blushes near the limit. */
function LengthRing({ length, max }: { length: number; max: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(length / max, 1);
  const hot = ratio > 0.9;
  return (
    <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
      <AnimatePresence>
        {hot ? (
          <motion.span initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="font-bold text-destructive">
            {max - length}
          </motion.span>
        ) : null}
      </AnimatePresence>
      <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden>
        <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3" className="stroke-border" />
        <motion.circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - ratio) }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn("transition-[stroke]", hot ? "stroke-destructive" : "stroke-primary")}
        />
      </svg>
    </span>
  );
}

function SubmitPage() {
  const { user } = Route.useLoaderData();
  const { t } = useI18n();
  const submit = useServerFn(submitPost);
  const [fields, setFields] = useState({ title: "", url: "", body: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = normalizeUrl(fields.url);
  const ready = fields.title.trim().length > 0 && url !== false;
  const set = (key: keyof typeof fields) => (e: { currentTarget: { value: string } }) => setFields({ ...fields, [key]: e.currentTarget.value });
  const setBody = (body: string) => setFields((f) => ({ ...f, body }));

  const preview: Post = {
    id: "00000000-0000-4000-8000-000000000000",
    title: fields.title.trim() || t("news.submit.previewTitle"),
    url: url || null,
    body: fields.body.trim() || null,
    author: { username: user.username, avatarUrl: user.avatarUrl },
    score: 1,
    commentCount: 0,
    createdAt: new Date(),
    voted: true,
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="stagger flex flex-col gap-2">
        <Link to="/news" className="group inline-flex w-fit items-center gap-1 text-sm font-bold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" /> {t("news.post.back")}
        </Link>
        <h1 className="text-3xl font-extrabold">
          <T k="news.submit.heading" values={{ sparkle: <span className="float inline-block text-primary">✦</span> }} />
        </h1>
        <p className="text-muted-foreground">{t("news.submit.lede")}</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="rise p-5 sm:p-6">
          <form
            className="flex flex-col gap-5"
            aria-busy={pending || undefined}
            onSubmit={async (event) => {
              event.preventDefault();
              if (!ready) return;
              setPending(true);
              setError(null);
              try {
                // Succeeds by redirecting to the new post.
                await submit({ data: new FormData(event.currentTarget) });
              } catch {
                setError(t("news.submit.failed"));
                setPending(false);
              }
            }}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="title" className="font-bold">
                  {t("news.submit.titleLabel")}
                </Label>
                <LengthRing length={fields.title.length} max={POST_TITLE_MAX} />
              </div>
              <Input id="title" name="title" required autoFocus maxLength={POST_TITLE_MAX} value={fields.title} onChange={set("title")} placeholder={t("news.submit.titlePlaceholder")} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="url" className="font-bold">
                <T k="news.submit.urlLabel" values={{ optional: <span className="font-normal text-muted-foreground">{t("news.submit.optional")}</span> }} />
              </Label>
              <Input
                id="url"
                name="url"
                inputMode="url"
                autoComplete="url"
                maxLength={POST_URL_MAX}
                value={fields.url}
                onChange={set("url")}
                aria-invalid={url === false || undefined}
                placeholder="https://github.com/you/cool-thing"
              />
              <AnimatePresence initial={false}>
                {url === false ? (
                  <motion.p initial={shut} animate={open} exit={shut} className="overflow-hidden text-sm font-bold text-destructive">
                    {t("news.submit.badUrl")}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="body" className="font-bold">
                <T k="news.submit.bodyLabel" values={{ optional: <span className="font-normal text-muted-foreground">{t("news.submit.optional")}</span> }} />
              </Label>
              <MarkdownField id="body" name="body" rows={6} maxLength={POST_BODY_MAX} onValueChange={setBody} placeholder={t("news.submit.bodyPlaceholder")} />
            </div>

            <AnimatePresence initial={false}>
              {error ? (
                <motion.p initial={shut} animate={open} exit={shut} className="overflow-hidden text-sm font-bold text-destructive">
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <Button type="submit" size="lg" disabled={!ready || pending} className="btn self-start rounded-full font-bold">
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
              {t("news.submit.post")}
            </Button>
          </form>
        </Card>

        <div className="rise flex flex-col gap-3 lg:sticky lg:top-24">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("news.submit.previewLabel")}</p>
          <motion.div layout className="relative overflow-hidden rounded-2xl border bg-card/80 p-3 shadow-[0_18px_40px_-24px_var(--primary)] backdrop-blur sm:p-4">
            <PostRow post={preview} rank={1} viewerUsername={user.username} preview />
          </motion.div>
          <AnimatePresence initial={false}>
            {preview.body ? (
              <motion.div initial={shut} animate={open} exit={shut} className="overflow-hidden">
                <div className="max-h-80 overflow-y-auto rounded-2xl border border-dashed bg-card/60 p-4 text-sm">
                  <Markdown>{preview.body}</Markdown>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
