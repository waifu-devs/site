import { Link } from "@tanstack/react-router";
import { ArrowDown, Database } from "lucide-react";
import { m as motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { useI18n } from "@/i18n/react";
import { STATUS_LABELS, type Project } from "@/lib/projects";
import { StatusDot } from "./ProjectCard";

const EASE = [0.22, 1, 0.36, 1] as const;

export function ProjectsHero({ projects }: { projects: Project[] }) {
  const reduce = useReducedMotion();
  const { t } = useI18n();

  // Arriving at /projects#fuwa, the browser scrolled to where the card was mid-swing; put it where it lands.
  useEffect(() => {
    let slug: string;
    try {
      slug = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return; // A malformed hash (a stray "%") names no project.
    }
    if (projects.some((p) => p.slug === slug)) requestAnimationFrame(() => scrollToProject(slug, "instant"));
  }, [projects]);

  return (
    <section data-sparkle-zone className="relative isolate overflow-hidden border-b">
      <div aria-hidden className="grid-floor absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-20">
        <span className="blob -left-20 top-8 size-72" />
        <span className="blob b2 right-[-6rem] top-1/3 size-80" />
        <span className="blob b3 bottom-[-8rem] left-1/3 size-72" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:pb-24 sm:pt-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col items-start gap-6">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-sm font-bold text-primary backdrop-blur"
          >
            <span className="heartbeat">✦</span> {t("projects.hero.badge")}
          </motion.p>

          <Headline />

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8, ease: EASE }}
            className="max-w-xl text-lg text-muted-foreground sm:text-xl"
          >
            {t("projects.hero.lede")}
          </motion.p>

          <ul className="flex flex-wrap gap-3">
            {projects.map((p, i) => (
              <motion.li
                key={p.slug}
                initial={{ opacity: 0, y: 16, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 22, delay: 1 + i * 0.1 }}
              >
                {/* The router would scroll to the hash itself, aiming at the card mid-swing, so it's told not to. */}
                <Link
                  to="/projects"
                  hash={p.slug}
                  hashScrollIntoView={false}
                  resetScroll={false}
                  onClick={() => scrollToProject(p.slug, reduce ? "instant" : "smooth")}
                  className="card-pop group flex items-center gap-3 rounded-2xl border bg-card/80 py-2.5 pl-3 pr-4 backdrop-blur hover:-translate-y-0.5"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-lg font-extrabold text-primary transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110">
                    {p.glyph}
                  </span>
                  <span>
                    <span className="block font-extrabold">{p.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <StatusDot status={p.status} /> {t(STATUS_LABELS[p.status])}
                    </span>
                  </span>
                  <ArrowDown className="ml-1 size-4 text-muted-foreground transition-[translate,color] duration-300 group-hover:translate-y-1 group-hover:text-primary" />
                </Link>
              </motion.li>
            ))}
          </ul>
        </div>

        <Stage />
      </div>
    </section>
  );
}

/**
 * Project cards move while they scroll in, so scrollIntoView would aim at
 * where a card is mid-swing. This aims at where it sits in the layout.
 */
function scrollToProject(slug: string, behavior: ScrollBehavior) {
  const card = document.getElementById(slug);
  if (!card) return;
  let top = 0;
  for (let node: HTMLElement | null = card; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  window.scrollTo({ top: top - parseFloat(getComputedStyle(card).scrollMarginTop || "0"), behavior });
}

/** Letters rise out of a mask on a spring, then a hand-drawn underline scribbles itself under the last word. */
function Headline() {
  const { t } = useI18n();
  const lines = [t("projects.hero.line1"), t("projects.hero.line2")];
  const words = lines.flatMap((text, line) => text.split(" ").map((word) => ({ text: word, line })));
  let n = 0;
  return (
    <h1 aria-label={lines.join(" ")} className="text-[clamp(2.8rem,5.6vw,4.75rem)] font-extrabold leading-[0.95] tracking-tight">
      {[0, 1].map((line) => (
        <span key={line} aria-hidden className="block">
          {words
            .filter((w) => w.line === line)
            .map((w, wi) => (
              <span key={wi}>
                {wi > 0 ? " " : null}
                <span className={line === 1 ? "relative inline-block text-primary" : "inline-block"}>
                  <span className="inline-block overflow-hidden whitespace-nowrap pb-[0.1em] align-bottom">
                    {Array.from(w.text).map((ch, i) => (
                      <motion.span
                        key={i}
                        className="inline-block origin-bottom-left"
                        initial={{ y: "110%", rotate: 14 }}
                        animate={{ y: "0%", rotate: 0 }}
                        transition={{ type: "spring", stiffness: 320, damping: 26, delay: 0.1 + n++ * 0.03 }}
                      >
                        {ch}
                      </motion.span>
                    ))}
                  </span>
                  {line === 1 ? <Scribble /> : null}
                </span>
              </span>
            ))}
        </span>
      ))}
    </h1>
  );
}

function Scribble() {
  return (
    <svg viewBox="0 0 300 24" preserveAspectRatio="none" className="absolute -bottom-[0.12em] left-0 h-[0.28em] w-full overflow-visible text-primary/60">
      <motion.path
        d="M4 16 C 60 6, 120 22, 180 12 S 270 6, 296 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, delay: 0.75, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}

/**
 * Bits of the projects floating at different depths: a fuwa chat bubble, a
 * self-hosted server's terminal, its database file, a theme chip. They drift
 * with the pointer like layers of a parallax shot.
 */
function Stage() {
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(px, { stiffness: 60, damping: 18, mass: 0.8 });
  const y = useSpring(py, { stiffness: 60, damping: 18, mass: 0.8 });

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px.set(e.clientX / window.innerWidth - 0.5);
      py.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, px, py]);

  return (
    <div aria-hidden className="relative mx-auto hidden aspect-square w-full max-w-[30rem] select-none sm:block">
      <div className="absolute inset-[18%] rounded-full bg-primary/25 blur-3xl" />

      <Layer x={x} y={y} depth={-20} className="absolute left-[2%] top-[2%] opacity-40">
        <span className="text-outline block text-[7.5rem] font-extrabold leading-none">ふわ</span>
      </Layer>
      <Layer x={x} y={y} depth={-12} className="absolute bottom-[2%] right-[2%] opacity-40">
        <span className="text-outline block text-[6.5rem] font-extrabold leading-none">家</span>
      </Layer>

      <Layer x={x} y={y} depth={30} className="absolute right-[2%] top-[14%] w-[68%]" delay={0.5}>
        <div className="float rounded-2xl rounded-bl-md border bg-card p-3 shadow-2xl shadow-primary/20" style={{ animationDuration: "6s" }}>
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">A</span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-primary">
                aoi <span className="font-bold text-muted-foreground">{t("projects.hero.mockChannel", { channel: "#watch-party" })}</span>
              </p>
              <p className="text-sm">{t("projects.fuwa.demo.club1")}</p>
            </div>
          </div>
          <div className="mt-2 flex gap-1.5 pl-10">
            {["🍡 3", "♡ 5"].map((r) => (
              <span key={r} className="rounded-full border bg-secondary px-2 py-0.5 text-[0.65rem] font-bold">
                {r}
              </span>
            ))}
          </div>
        </div>
      </Layer>

      <Layer x={x} y={y} depth={55} className="absolute left-0 top-[48%] w-[72%]" delay={0.75}>
        <div className="float overflow-hidden rounded-2xl border bg-card/95 shadow-2xl shadow-primary/20 backdrop-blur" style={{ animationDuration: "7s", animationDelay: "-2s" }}>
          <div className="flex items-center gap-1.5 border-b px-3 py-2">
            <span className="size-2 rounded-full bg-[#ff5f57]" />
            <span className="size-2 rounded-full bg-[#febc2e]" />
            <span className="size-2 rounded-full bg-[#28c840]" />
            <span className="ml-2 text-[0.65rem] text-muted-foreground">~/home-lab</span>
          </div>
          <pre className="px-3 py-2.5 font-mono text-[0.7rem] leading-5">
            <span className="tok-kw">$</span> ./fuwa{"\n"}
            <span className="tok-cm">loading servers from ./data</span>
            {"\n"}
            <span className="tok-str">✓</span> home-lab.db{"  "}
            <span className="tok-str">✓</span> anime-club.db{"\n"}
            <span className="tok-fn">listening</span> ♡<span className="caret" />
          </pre>
        </div>
      </Layer>

      <Layer x={x} y={y} depth={80} className="absolute bottom-[12%] right-[10%]" delay={1}>
        <div className="flex -rotate-6 items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-bold shadow-xl">
          <Database className="db-pulse size-3.5 text-primary" /> anime-club.db
        </div>
      </Layer>

      <Layer x={x} y={y} depth={65} className="absolute left-[8%] top-[36%]" delay={1.15}>
        <div className="flex rotate-3 items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-bold shadow-xl">
          <span className="flex -space-x-1.5">
            <span className="size-4 rounded-full border-2 border-card bg-primary" />
            <span className="size-4 rounded-full border-2 border-card bg-accent" />
            <span className="size-4 rounded-full border-2 border-card bg-foreground" />
          </span>
          {t("landing.mock.theme")}
        </div>
      </Layer>
    </div>
  );
}

function Layer({
  x,
  y,
  depth,
  delay = 0.3,
  className,
  children,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  depth: number;
  delay?: number;
  className: string;
  children: ReactNode;
}) {
  const tx = useTransform(x, (v) => v * depth);
  const ty = useTransform(y, (v) => v * depth);
  return (
    <motion.div style={{ x: tx, y: ty }} className={className}>
      <motion.div
        initial={{ opacity: 0, scale: 0.7, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 18, delay }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
