import { ArrowUpRight } from "lucide-react";
import { m as motion, useMotionValue, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { Magnetic } from "@/components/animate-ui/primitives/effects/magnetic";
import { Button } from "@/components/ui/button";
import { T, useI18n } from "@/i18n/react";
import { type Paragraph, type Run, STATUS_LABELS, type Project, type ProjectStatus } from "@/lib/projects";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// Tailwind only sees whole class names, so the column counts are spelled out.
const HIGHLIGHT_COLS: Record<number, string> = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };

/**
 * One project, as a big card: the story on one side and a live visual on the
 * other (they swap sides from one card to the next), then its highlights.
 * It swings up into place as it scrolls in, and a glow follows the pointer
 * around its border.
 */
export function ProjectCard({
  project,
  index,
  visual,
  children,
}: {
  project: Project;
  index: number;
  visual: ReactNode;
  /** Extra bands under the highlights. */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const { t } = useI18n();
  // Reduced motion flattens the scroll effects through a motion value rather than by dropping
  // the styles, so the first render always matches the server's and hydration stays clean.
  const reduce = useReducedMotion();
  const calm = useMotionValue(0);
  useEffect(() => calm.set(reduce ? 1 : 0), [reduce, calm]);
  const { scrollYProgress: entering } = useScroll({ target: ref, offset: ["start end", "start 0.35"] });
  const scale = useTransform([entering, calm], ([p, c]: number[]) => (c ? 1 : 0.93 + 0.07 * p));
  const rotateX = useTransform([entering, calm], ([p, c]: number[]) => (c ? 0 : 7 * (1 - p)));
  const y = useTransform([entering, calm], ([p, c]: number[]) => (c ? 0 : 70 * (1 - p)));
  // The outlined glyph behind the name drifts against the scroll, like a layer further back.
  const { scrollYProgress: passing } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const glyphY = useTransform([passing, calm], ([p, c]: number[]) => (c ? 0 : 70 - 140 * p));

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  return (
    <motion.article
      ref={ref}
      id={project.slug}
      aria-labelledby={`${project.slug}-name`}
      onPointerMove={onPointerMove}
      style={{ scale, rotateX, y, transformPerspective: 1600 }}
      className="spotlight scroll-mt-24 overflow-hidden rounded-3xl border bg-card/85 shadow-2xl shadow-primary/10 backdrop-blur-md"
    >
      <div className="grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-2 lg:gap-14">
        <div className={cn("relative flex min-w-0 flex-col items-start gap-5", index % 2 === 1 && "lg:order-last")}>
          <motion.span
            aria-hidden
            style={{ y: glyphY }}
            className="text-outline pointer-events-none absolute -top-8 right-0 -z-10 select-none text-[clamp(4.5rem,13vw,8.5rem)] font-extrabold leading-none opacity-35"
          >
            {project.glyph}
          </motion.span>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge status={project.status} />
            <a href={`https://github.com/${project.repo}`} className="font-mono text-xs text-muted-foreground transition-colors hover:text-primary">
              {project.repo}
            </a>
          </div>

          <ProjectName id={`${project.slug}-name`} name={project.name} />

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
            className="text-xl font-bold leading-snug"
          >
            {t(project.tagline)}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.35, ease: EASE }}
          >
            <Description className="leading-relaxed text-muted-foreground" paragraphs={project.description} />
          </motion.div>

          <Stack items={project.stack} />

          <div className="flex flex-wrap gap-3 pt-1">
            <Magnetic strength={0.3}>
              <Button asChild className="btn h-11 rounded-full px-6 font-bold">
                <a href={`https://github.com/${project.repo}`}>
                  <GitHubMark className="size-4" /> {t("projects.card.viewOnGitHub")}
                </a>
              </Button>
            </Magnetic>
            {project.url ? (
              <Magnetic strength={0.3}>
                <Button asChild variant="outline" className="btn group h-11 rounded-full bg-card/80 px-6 font-bold">
                  <a href={project.url}>
                    {new URL(project.url).hostname.replace(/^www\./, "")}
                    <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </a>
                </Button>
              </Magnetic>
            ) : null}
          </div>
        </div>

        <div className="relative min-w-0">{visual}</div>
      </div>

      {project.highlights.length ? <Highlights items={project.highlights} /> : null}
      {children}
    </motion.article>
  );
}

/** A project's description, styled like the Markdown it used to be (the .markdown styles in app.css). */
function Description({ paragraphs, className }: { paragraphs: Paragraph[]; className?: string }) {
  return (
    <div className={cn("markdown", className)}>
      {paragraphs.map((p) => (
        <p key={p.k}>
          <T k={p.k} values={Object.fromEntries(Object.entries(p.values ?? {}).map(([name, run]) => [name, <RunText key={name} run={run} />]))} />
        </p>
      ))}
    </div>
  );
}

function RunText({ run }: { run: Run }) {
  const { t } = useI18n();
  const text = "k" in run ? t(run.k) : run.text;
  const styled = run.style === "strong" ? <strong>{text}</strong> : run.style === "em" ? <em>{text}</em> : run.style === "code" ? <code>{text}</code> : text;
  return run.href ? (
    <a href={run.href} rel="nofollow ugc noopener noreferrer" target="_blank">
      {styled}
    </a>
  ) : (
    styled
  );
}

const LETTER = {
  hidden: { y: "110%", rotate: 12 },
  shown: (i: number) => ({ y: "0%", rotate: 0, transition: { type: "spring" as const, stiffness: 330, damping: 22, delay: 0.05 + i * 0.035 } }),
};

/**
 * Letters spring up out of a mask the first time the name scrolls in, and each
 * one hops when the pointer passes over it (.hop). The mask only clips the
 * bottom edge, so the hops aren't cut off.
 */
function ProjectName({ id, name }: { id: string; name: string }) {
  return (
    // The heading watches the viewport, not the letters: hidden under the mask, they never count as in view.
    <motion.h2
      id={id}
      aria-label={name}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true }}
      className="text-[clamp(3rem,8vw,5.25rem)] font-extrabold leading-[0.95] tracking-tight"
    >
      <span aria-hidden className="inline-block whitespace-nowrap pb-[0.08em] [clip-path:inset(-50%_-10%_0_-10%)]">
        {Array.from(name).map((ch, i) => (
          <motion.span
            key={i}
            custom={i}
            variants={LETTER}
            className="inline-block origin-bottom-left"
          >
            <span className="hop inline-block">{ch}</span>
          </motion.span>
        ))}
      </span>
    </motion.h2>
  );
}

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold",
        status === "live" ? "border-primary/40 bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      <StatusDot status={status} />
      {t(STATUS_LABELS[status])}
    </span>
  );
}

/** Live pings, in-development spins, planned just sits there. */
export function StatusDot({ status }: { status: ProjectStatus }) {
  if (status === "live") return <span className="status-dot" />;
  if (status === "building") return <span className="size-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent [animation-duration:1.6s]" />;
  return <span className="size-2 rounded-full border-2 border-muted-foreground" />;
}

function Stack({ items }: { items: string[] }) {
  const { t } = useI18n();
  return (
    <ul aria-label={t("projects.card.builtWith")} className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <motion.li
          key={item}
          initial={{ opacity: 0, scale: 0.5, y: 10 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.45 + i * 0.07 }}
        >
          <span className="hop block cursor-default rounded-full border bg-background/70 px-3 py-1 text-xs font-bold hover:border-primary">
            {item}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

function Highlights({ items }: { items: Project["highlights"] }) {
  const { t } = useI18n();
  return (
    <ul className={cn("grid gap-px overflow-hidden border-t bg-border sm:grid-cols-2", HIGHLIGHT_COLS[items.length])}>
      {items.map(({ icon: Icon, title, body }, i) => (
        <motion.li
          key={title}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6, delay: i * 0.08, ease: EASE }}
          className="group flex flex-col gap-2 bg-card p-6 transition-colors hover:bg-accent/60"
        >
          <span className="group-wiggle grid size-10 place-items-center rounded-xl bg-primary/12 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="size-5" />
          </span>
          <p className="font-extrabold">{t(title)}</p>
          <p className="text-sm text-muted-foreground">{t(body)}</p>
        </motion.li>
      ))}
    </ul>
  );
}

/** GitHub's mark. lucide-react no longer ships brand icons. */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
