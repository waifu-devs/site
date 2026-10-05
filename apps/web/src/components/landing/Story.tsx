import { deriveTokens, themeStyle, type ThemeSeeds } from "@waifu-devs/domain/themes";
import { AnimatePresence, m as motion, useInView, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";

const CHAPTERS = [
  { kicker: "landing.story.profile.kicker", title: "landing.story.profile.title", body: "landing.story.profile.body" },
  { kicker: "landing.story.colors.kicker", title: "landing.story.colors.title", body: "landing.story.colors.body" },
  { kicker: "landing.story.people.kicker", title: "landing.story.people.title", body: "landing.story.people.body" },
] as const;

/**
 * Three chapters told as you scroll. On wide screens the visual stays pinned while the
 * chapters change beside it; on phones each chapter carries its own visual.
 */
export function Story() {
  return (
    <section className="relative">
      <Pinned />
      <div className="mx-auto flex max-w-xl flex-col gap-20 px-4 py-24 md:hidden">
        {CHAPTERS.map((c, i) => (
          <motion.div
            key={c.kicker}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-6"
          >
            <ChapterText chapter={c} />
            <Visual step={i} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Pinned() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(Math.min(CHAPTERS.length - 1, Math.floor(v * CHAPTERS.length))));

  return (
    <div ref={ref} className="hidden h-[300vh] md:block">
      <div className="sticky top-16 mx-auto grid h-[calc(100svh-4rem)] max-w-6xl grid-cols-[1fr_1.1fr] items-center gap-16 px-4">
        <div className="relative flex flex-col gap-10 pl-8">
          <div className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-border">
            <motion.div style={{ scaleY: scrollYProgress }} className="h-full w-full origin-top rounded-full bg-primary" />
          </div>
          {CHAPTERS.map((c, i) => (
            <motion.div
              key={c.kicker}
              animate={{ opacity: i === step ? 1 : 0.28, x: i === step ? 0 : -8, scale: i === step ? 1 : 0.97 }}
              transition={{ type: "spring", stiffness: 200, damping: 26 }}
              className="origin-left"
            >
              <ChapterText chapter={c} compact={i !== step} />
            </motion.div>
          ))}
        </div>
        <div className="relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 40, rotate: -2, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, rotate: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -40, rotate: 2, filter: "blur(8px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <Visual step={step} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ChapterText({ chapter, compact = false }: { chapter: (typeof CHAPTERS)[number]; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-primary">{t(chapter.kicker)}</p>
      <h2 className="text-3xl font-extrabold leading-tight tracking-tight lg:text-5xl">{t(chapter.title)}</h2>
      <p className={cn("max-w-md text-lg text-muted-foreground transition-opacity", compact && "md:opacity-0")}>{t(chapter.body)}</p>
    </div>
  );
}

function Visual({ step }: { step: number }) {
  return (
    <div className="relative aspect-[4/3.2] w-full">
      <div aria-hidden className="absolute inset-[10%] rounded-full bg-primary/25 blur-3xl" />
      {step === 0 ? <ProfileScene /> : step === 1 ? <PaintScene /> : <PeopleScene />}
    </div>
  );
}

const pop = (delay: number) => ({
  initial: { opacity: 0, scale: 0.6, y: 12 },
  whileInView: { opacity: 1, scale: 1, y: 0 },
  viewport: { once: true },
  transition: { type: "spring" as const, stiffness: 380, damping: 20, delay },
});

/** A profile assembling itself piece by piece. */
function ProfileScene() {
  const { t } = useI18n();
  return (
    <div aria-hidden className="absolute inset-0 grid place-items-center">
      <div className="w-[82%] rounded-3xl border bg-card p-6 shadow-2xl shadow-primary/20">
        <div className="-mx-6 -mt-6 mb-4 h-20 rounded-t-3xl bg-[linear-gradient(120deg,var(--primary),color-mix(in_srgb,var(--primary)_40%,#a78bfa))]" />
        <div className="-mt-14 flex items-end gap-4">
          <motion.span {...pop(0.1)} className="avatar-ring grid size-20 shrink-0 place-items-center rounded-full p-1">
            <span className="grid size-full place-items-center rounded-full border-4 border-card bg-primary text-3xl text-primary-foreground">✿</span>
          </motion.span>
          <motion.div {...pop(0.25)} className="pb-1">
            <p className="text-xl font-extrabold">{t("landing.mock.name")}</p>
            <p className="text-sm text-muted-foreground">{t("landing.mock.pronouns")}</p>
          </motion.div>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          {["92%", "74%", "83%"].map((w, i) => (
            <motion.div
              key={w}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.4 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              style={{ width: w }}
              className="h-2.5 origin-left rounded-full bg-muted"
            />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {[t("landing.mock.bestGirl"), "github.com/you", "TypeScript"].map((b, i) => (
            <motion.span
              key={b}
              {...pop(0.7 + i * 0.1)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold",
                i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              {b}
            </motion.span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Demo palettes for the paint scene. They only show that the colors change, they aren't themes on the site. */
const PALETTES: ThemeSeeds[] = [
  { background: "#fff4f7", foreground: "#3b2330", card: "#ffffff", primary: "#f0568c", "primary-foreground": "#ffffff", "muted-foreground": "#8a6577", border: "#f6d0dd" },
  { background: "#111024", foreground: "#ebe8ff", card: "#1c1a36", primary: "#8b6cff", "primary-foreground": "#111024", "muted-foreground": "#9d97c4", border: "#2f2b55" },
  { background: "#eefaf5", foreground: "#11332a", card: "#ffffff", primary: "#12a58f", "primary-foreground": "#ffffff", "muted-foreground": "#56766c", border: "#cfeee2" },
  { background: "#1b1310", foreground: "#ffeedf", card: "#2a1d17", primary: "#ff8a3d", "primary-foreground": "#1b1310", "muted-foreground": "#c79d85", border: "#47302a" },
];

/** A tiny site that repaints itself every beat while it's on screen. */
function PaintScene() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % PALETTES.length), 1500);
    return () => clearInterval(id);
  }, [inView, reduce]);

  return (
    <div ref={ref} aria-hidden className="absolute inset-0 grid place-items-center">
      <div
        className="themed w-[86%] overflow-hidden rounded-3xl border shadow-2xl"
        style={themeStyle({ tokens: deriveTokens(PALETTES[i]), radius: 1 })}
      >
        <div className="flex items-center gap-2 border-b bg-card px-4 py-3">
          <span className="text-primary">♡</span>
          <span className="h-2 w-16 rounded-full bg-foreground/70" />
          <span className="ml-auto h-6 w-16 rounded-full bg-primary" />
        </div>
        <div className="flex flex-col gap-3 p-5">
          <span className="h-4 w-3/4 rounded-full bg-foreground" />
          <span className="h-3 w-1/2 rounded-full bg-muted-foreground/60" />
          <div className="mt-2 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((k) => (
              <div key={k} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
                <span className="size-6 rounded-full bg-primary" />
                <span className="h-2 w-full rounded-full bg-muted" />
                <span className="h-2 w-2/3 rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -bottom-2 flex gap-3 rounded-full border bg-card px-4 py-2.5 shadow-xl">
        {PALETTES.map((p, k) => (
          <motion.span
            key={p.primary}
            animate={{ scale: k === i ? 1.35 : 1, y: k === i ? -4 : 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="size-6 rounded-full border-2 border-card shadow"
            style={{ background: p.primary, outline: k === i ? `2px solid ${p.primary}` : "none", outlineOffset: 2 }}
          />
        ))}
      </div>
    </div>
  );
}

/** Abstract people, not real members: bubbles that connect to "you" in the middle. */
const NODES = [
  { x: 50, y: 50, g: "✿", you: true },
  { x: 18, y: 22, g: "♡" },
  { x: 80, y: 18, g: "✦" },
  { x: 88, y: 58, g: "❀" },
  { x: 66, y: 86, g: "★" },
  { x: 26, y: 80, g: "✧" },
  { x: 10, y: 52, g: "♡" },
];
const LINKS: [number, number][] = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 6], [2, 3], [4, 5]];

function PeopleScene() {
  return (
    <div aria-hidden className="absolute inset-[4%]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        {LINKS.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            stroke="var(--primary)"
            strokeOpacity={0.45}
            strokeWidth={0.4}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </svg>
      {NODES.map((n, i) => (
        <motion.span
          key={i}
          {...pop(i * 0.08)}
          className="absolute"
          style={{ left: `${n.x}%`, top: `${n.y}%`, translate: "-50% -50%" }}
        >
          <span
            className={cn(
              "float grid place-items-center rounded-full border shadow-lg",
              n.you ? "avatar-ring size-24 p-1" : "size-14 bg-card text-xl text-primary",
            )}
            style={{ animationDelay: `${-i * 0.7}s`, animationDuration: `${4 + (i % 3)}s` }}
          >
            {n.you ? (
              <span className="grid size-full place-items-center rounded-full bg-primary text-3xl text-primary-foreground">{n.g}</span>
            ) : (
              n.g
            )}
          </span>
        </motion.span>
      ))}
    </div>
  );
}
