import {
  m as motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
} from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

const WORDS = ["TypeScript", "Rem", "Rust", "Asuna", "Go", "Zero Two", "Effect", "Kurisu", "Zig", "Megumin", "Haskell", "Marin"];

/** Two tilted tapes of words running opposite ways. They drift on their own, speed up with scroll speed and flip with scroll direction. */
export function Marquee() {
  return (
    <section aria-hidden className="overflow-hidden py-20">
      <div className="flex -rotate-3 flex-col gap-2">
        <Tape baseVelocity={-3} className="border-y bg-primary text-primary-foreground shadow-xl shadow-primary/25" />
        <Tape baseVelocity={2.4} outline />
      </div>
    </section>
  );
}

function Tape({ baseVelocity, outline = false, className }: { baseVelocity: number; outline?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const base = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const boost = useTransform(velocity, [0, 1000], [0, 4], { clamp: false });
  // Four identical copies, so sliding by one copy (25%) and wrapping back is seamless.
  const x = useTransform(base, (v) => `${wrap(-25, 0, v)}%`);
  const direction = useRef(1);

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const b = boost.get();
    if (b < 0) direction.current = -1;
    else if (b > 0) direction.current = 1;
    const step = direction.current * baseVelocity * (delta / 1000);
    base.set(base.get() + step + step * Math.abs(b));
  });

  return (
    <div className={cn("-mx-[5%] overflow-hidden py-3", className)}>
      <motion.div style={{ x }} className="flex w-max">
        {[0, 1, 2, 3].map((copy) => (
          <span key={copy} className="flex shrink-0 items-center">
            {WORDS.map((w) => (
              <span key={w} className="flex items-center">
                <span className={cn("px-6 text-3xl font-extrabold tracking-tight sm:text-5xl", outline && "text-outline")}>{w}</span>
                <span className={cn("text-2xl sm:text-3xl", outline ? "text-primary" : "opacity-80")}>✦</span>
              </span>
            ))}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
