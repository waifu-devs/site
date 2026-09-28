import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Magnetic } from "@/components/animate-ui/primitives/effects/magnetic";
import { SlidingNumber } from "@/components/animate-ui/primitives/texts/sliding-number";
import { Button } from "@/components/ui/button";
import { useViewer } from "@/lib/viewer";

/** The closing call: a headline that fills with color as it scrolls into place. */
export function Finale({ memberCount }: { memberCount: number }) {
  const { user } = useViewer();
  const ref = useRef<HTMLElement>(null);
  // Ends when the section's bottom meets the viewport's, which every screen size can reach before the page runs out.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const fill = useTransform(scrollYProgress, [0.2, 0.9], ["0% 100%", "100% 100%"]);
  const lift = useTransform(scrollYProgress, [0, 1], [80, 0]);

  return (
    <section ref={ref} data-sparkle-zone className="relative isolate overflow-hidden px-4 py-32 sm:py-40">
      <div aria-hidden className="grid-floor absolute inset-0 -z-10 rotate-180" />
      <motion.div style={{ y: lift }} className="mx-auto flex max-w-5xl flex-col items-center gap-8 text-center">
        <h2 className="relative text-[clamp(3rem,11vw,8.5rem)] font-extrabold leading-[0.9] tracking-tight">
          <span className="text-outline">Your spot's warm.</span>
          <motion.span aria-hidden style={{ backgroundSize: fill }} className="fill-text absolute inset-0">
            Your spot's warm.
          </motion.span>
        </h2>
        <p className="flex flex-wrap items-center justify-center gap-x-2 text-xl text-muted-foreground">
          <span className="inline-flex font-extrabold text-foreground">
            <SlidingNumber number={memberCount} inView inViewOnce />
          </span>
          {memberCount === 1 ? "dev is" : "devs are"} already here.
        </p>
        <Magnetic strength={0.4}>
          <Button asChild size="lg" className="btn h-14 rounded-full px-9 text-lg font-bold">
            {user ? <Link to="/settings">Make it yours ✦</Link> : <Link to="/login">Join with GitHub ♡</Link>}
          </Button>
        </Magnetic>
      </motion.div>
    </section>
  );
}
