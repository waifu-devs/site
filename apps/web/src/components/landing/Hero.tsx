import { Link } from "@tanstack/react-router";
import { mix, type ThemeTokens } from "@waifu-devs/domain/themes";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { BubbleBackground } from "@/components/animate-ui/components/backgrounds/bubble";
import { Magnetic } from "@/components/animate-ui/primitives/effects/magnetic";
import { RotatingText, RotatingTextContainer } from "@/components/animate-ui/primitives/texts/rotating";
import { SlidingNumber } from "@/components/animate-ui/primitives/texts/sliding-number";
import { Button } from "@/components/ui/button";
import { useViewer } from "@/lib/viewer";

const LINES = ["Devs who", "love their waifus"];
const PHRASES = ["ship together.", "debug at 3am.", "defend best girl.", "rewrite in Rust.", "deploy Fridays."];
const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero({ memberCount }: { memberCount: number }) {
  const { user, theme } = useViewer();
  return (
    <section data-sparkle-zone className="relative isolate overflow-hidden border-b">
      <BubbleBackground
        interactive
        colors={bubbleColors(theme.variant.tokens)}
        className="absolute inset-0 -z-20 bg-none opacity-40"
      />
      <div aria-hidden className="grid-floor absolute inset-0 -z-10" />

      <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl items-center gap-12 px-4 pb-24 pt-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:pt-0">
        <div className="flex flex-col items-start gap-7">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-sm font-bold text-primary backdrop-blur"
          >
            <span className="heartbeat">♡</span>
            <SlidingNumber number={memberCount} /> {memberCount === 1 ? "dev" : "devs"} and counting
          </motion.p>

          <KineticHeadline />

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9, ease: EASE }}
            className="max-w-xl text-lg text-muted-foreground sm:text-xl"
          >
            A home on the internet for developers who love anime. Make a profile, show off your best girl, and dress the
            whole site in colors you designed yourself.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.05, ease: EASE }}
            className="flex flex-wrap gap-3"
          >
            <Magnetic strength={0.35}>
              <Button asChild size="lg" className="btn h-12 rounded-full px-7 text-base font-bold">
                {user ? (
                  <Link to="/u/$username" params={{ username: user.username }}>
                    View my profile
                  </Link>
                ) : (
                  <Link to="/login">Join with GitHub ♡</Link>
                )}
              </Button>
            </Magnetic>
            <Magnetic strength={0.35}>
              <Button asChild size="lg" variant="outline" className="btn h-12 rounded-full bg-card/80 px-7 text-base font-bold backdrop-blur">
                <Link to="/themes/new">Paint your theme</Link>
              </Button>
            </Magnetic>
          </motion.div>
        </div>

        <Stage />
      </div>

      <ScrollCue />
    </section>
  );
}

/** Each letter rises out of a mask on a spring, one after another, then the last line starts rotating. */
function KineticHeadline() {
  const reduce = useReducedMotion();
  let n = 0;
  return (
    <h1
      aria-label={`${LINES.join(" ")} ${PHRASES[0]}`}
      className="text-[clamp(2.6rem,5.4vw,4.9rem)] font-extrabold leading-[0.95] tracking-tight"
    >
      {LINES.map((line) => (
        <span key={line} aria-hidden className="block">
          {line.split(" ").map((word, w) => (
            <span key={word}>
              {w > 0 ? " " : null}
              <span className="inline-block overflow-hidden whitespace-nowrap pb-[0.1em] align-bottom">
                {Array.from(word).map((ch, i) => (
                  <motion.span
                    key={i}
                    className="inline-block origin-bottom-left"
                    initial={{ y: "110%", rotate: 14 }}
                    animate={{ y: "0%", rotate: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26, delay: 0.1 + n++ * 0.028 }}
                  >
                    {ch}
                  </motion.span>
                ))}
              </span>
            </span>
          ))}
        </span>
      ))}
      <motion.span
        aria-hidden
        className="mt-2 block text-[0.72em]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.75, ease: EASE }}
      >
        {/* A single string doesn't rotate, so reduced motion holds the first phrase. Same markup either way, so hydration matches. */}
        <RotatingTextContainer text={reduce ? PHRASES[0] : PHRASES} duration={2600} delay={1400} className="min-h-[1.2em] leading-[1.2]">
          <RotatingText className="gradient-text whitespace-nowrap" />
        </RotatingTextContainer>
      </motion.span>
    </h1>
  );
}

/**
 * The hero's right side: a code window, a profile card and a theme chip at different depths.
 * They drift with the pointer like layers of a parallax shot.
 */
function Stage() {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(px, { stiffness: 60, damping: 18, mass: 0.8 });
  const y = useSpring(py, { stiffness: 60, damping: 18, mass: 0.8 });
  const rotateX = useTransform(y, (v) => v * -10);
  const rotateY = useTransform(x, (v) => v * 14);

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
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 40, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 90, damping: 20, delay: 0.45 }}
      style={{ rotateX, rotateY, transformPerspective: 1200 }}
      className="relative mx-auto aspect-[10/9] w-full max-w-[32rem] select-none"
    >
      <div className="absolute inset-[12%] rounded-full bg-primary/30 blur-3xl" />
      <Orbit />
      <Layer x={x} y={y} depth={18} className="absolute inset-x-[4%] top-[2%]">
        <CodeWindow />
      </Layer>
      <Layer x={x} y={y} depth={46} className="absolute bottom-[2%] left-0 w-[72%] sm:w-[58%]">
        <ProfileCard />
      </Layer>
      <Layer x={x} y={y} depth={70} className="absolute right-0 top-[50%]">
        <ThemeChip />
      </Layer>
    </motion.div>
  );
}

function Layer({ x, y, depth, className, children }: { x: MotionValue<number>; y: MotionValue<number>; depth: number; className: string; children: ReactNode }) {
  const tx = useTransform(x, (v) => v * depth);
  const ty = useTransform(y, (v) => v * depth);
  return (
    <motion.div style={{ x: tx, y: ty }} className={className}>
      {children}
    </motion.div>
  );
}

/** Glyphs slowly circling behind the stage. */
function Orbit() {
  const glyphs = ["♡", "✦", "❀", "✧", "★", "♡", "✦", "❀"];
  return (
    <div className="spin-slow absolute inset-[-4%] rounded-full border border-dashed border-primary/25">
      {glyphs.map((g, i) => {
        const a = (i / glyphs.length) * Math.PI * 2;
        return (
          <span
            key={i}
            className="absolute text-xl text-primary/70"
            style={{ left: `${50 + Math.cos(a) * 50}%`, top: `${50 + Math.sin(a) * 50}%`, translate: "-50% -50%" }}
          >
            {g}
          </span>
        );
      })}
    </div>
  );
}

type Token = [text: string, kind?: "kw" | "fn" | "str" | "cm"];
const CODE: Token[][] = [
  [["import", "kw"], [" { "], ["join", "fn"], [" } "], ["from", "kw"], [" "], ['"waifu-devs"', "str"]],
  [],
  [["const", "kw"], [" me = "], ["await", "kw"], [" "], ["join", "fn"], ["({ with: "], ['"github"', "str"], [" })"]],
  [["me.bestGirl = "], ['"Rem"', "str"], ["  "], ["// non-negotiable", "cm"]],
  [["me.theme = "], ["paint", "fn"], ["("], ['"yours"', "str"], [")"], ["  "], ["// everywhere", "cm"]],
  [],
  [["ship", "fn"], ["(me)"], ["  "], ["// ♡", "cm"]],
];
const lineLength = (line: Token[]) => line.reduce((sum, [text]) => sum + text.length, 0);
// Every line plus the newline after it, except the last.
const CODE_LENGTH = CODE.reduce((sum, line) => sum + lineLength(line) + 1, 0) - 1;

/** Types itself out once, then leaves a blinking caret. */
function CodeWindow() {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    if (reduce) return setTyped(CODE_LENGTH);
    if (typed >= CODE_LENGTH) return;
    const id = setTimeout(() => setTyped((t) => t + 1), typed === 0 ? 900 : 24);
    return () => clearTimeout(id);
  }, [reduce, typed]);

  let offset = 0;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card/90 shadow-2xl shadow-primary/20 backdrop-blur">
      <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-xs text-muted-foreground">~/waifu-devs · you.ts</span>
      </div>
      <pre className="min-h-[13.5rem] overflow-hidden px-4 py-4 font-mono text-[0.62rem] leading-6 min-[420px]:text-[0.72rem] sm:text-[0.8rem]">
        {CODE.map((line, li) => {
          const start = offset;
          const length = lineLength(line);
          offset += length + 1;
          let budget = Math.max(0, typed - start);
          const visible: ReactNode[] = [];
          for (const [text, kind] of line) {
            if (budget <= 0) break;
            const part = text.slice(0, budget);
            budget -= part.length;
            visible.push(
              <span key={visible.length} className={kind ? `tok-${kind}` : undefined}>
                {part}
              </span>,
            );
          }
          return (
            <div key={li} className="min-h-6">
              <span className="mr-4 inline-block w-4 text-right text-muted-foreground/50">{li + 1}</span>
              {visible}
              {typed >= start && typed <= start + length ? <span className="caret" /> : null}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function ProfileCard() {
  return (
    <div className="float rounded-2xl border bg-card p-4 shadow-2xl shadow-primary/25" style={{ animationDuration: "6s" }}>
      <div className="flex items-center gap-3">
        <span className="avatar-ring grid size-14 shrink-0 place-items-center rounded-full p-[3px]">
          <span className="grid size-full place-items-center rounded-full bg-primary text-2xl text-primary-foreground">✿</span>
        </span>
        <div className="min-w-0">
          <p className="truncate font-extrabold">you, but cuter</p>
          <p className="truncate text-xs text-muted-foreground">u/you · joined today</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["♡ Rem", "she/her", "TypeScript"].map((b, i) => (
          <motion.span
            key={b}
            initial={{ opacity: 0, scale: 0.4, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 18, delay: 1.3 + i * 0.12 }}
            className={
              i === 0
                ? "rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground"
                : "rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground"
            }
          >
            {b}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function ThemeChip() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24, rotate: 8 }}
      animate={{ opacity: 1, x: 0, rotate: -4 }}
      transition={{ type: "spring", stiffness: 200, damping: 16, delay: 1.7 }}
      className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-bold shadow-xl"
    >
      <span className="flex -space-x-1.5">
        <span className="size-4 rounded-full border-2 border-card bg-primary" />
        <span className="size-4 rounded-full border-2 border-card bg-accent" />
        <span className="size-4 rounded-full border-2 border-card bg-foreground" />
      </span>
      theme: yours
    </motion.div>
  );
}

function ScrollCue() {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 2.2, duration: 0.8 }}
      className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.3em] text-muted-foreground sm:flex"
    >
      scroll
      <span className="scroll-line h-10 w-px overflow-hidden bg-border" />
    </motion.div>
  );
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

/** Bubble colors drawn from the viewer's theme, so the hero matches whatever they wear. */
function bubbleColors(t: ThemeTokens) {
  return {
    first: rgb(t.primary),
    second: rgb(mix(t.primary, "#a78bfa", 0.5)),
    third: rgb(mix(t.primary, "#7dd3fc", 0.45)),
    fourth: rgb(t.ring),
    fifth: rgb(mix(t.primary, "#f9a8d4", 0.5)),
    sixth: rgb(t.accent),
  };
}
