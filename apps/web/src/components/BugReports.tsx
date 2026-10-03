import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { setReportsOn, useReportsOn } from "@/lib/reports";
import { cn } from "@/lib/utils";

const SENT = [
  "Kinds of errors, and which page they happened on",
  "How long pages took to load and change, and slow frames",
  "Which pages get visited, counted together",
  "Your browser family and OS family",
];
const NEVER = ["Anything you type", "Your name, account or the address of the page", "Your IP address, or anything that tells you apart"];

const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const;

/** What's sent and what never is, each line easing in after the last. */
function WhatsSent({ dim }: { dim: boolean }) {
  return (
    <motion.div animate={{ opacity: dim ? 0.55 : 1 }} transition={SPRING} className="grid gap-2 text-sm sm:grid-cols-2">
      {[
        { title: "What's sent", lines: SENT, mark: "✓", tone: "text-primary" },
        { title: "Never sent", lines: NEVER, mark: "✕", tone: "text-destructive" },
      ].map((column, c) => (
        <ul key={column.title} className="flex flex-col gap-1.5 rounded-xl bg-muted/60 px-3 py-2.5 text-left">
          <li className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{column.title}</li>
          {column.lines.map((line, n) => (
            <motion.li
              key={line}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...SPRING, delay: 0.04 * (n + c * SENT.length) }}
              className="flex gap-2"
            >
              <span aria-hidden className={cn("font-bold", column.tone)}>
                {column.mark}
              </span>
              <span>{line}</span>
            </motion.li>
          ))}
        </ul>
      ))}
    </motion.div>
  );
}

/** The switch, with plainly what it sends: for settings. */
export function BugReportsSetting() {
  const on = useReportsOn();
  return (
    <div className="flex flex-col gap-3 text-left">
      <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
        <span className="grid gap-0.5">
          <span className="text-sm font-bold">Send anonymous bug reports</span>
          <span className="text-xs text-muted-foreground">
            Counts only, so we can find what breaks or drags. They go to this site's own server and on to our analytics; this
            browser talks to nothing else.
          </span>
        </span>
        <Switch checked={on} onCheckedChange={setReportsOn} aria-label="Send anonymous bug reports" />
      </label>
      <WhatsSent dim={!on} />
    </div>
  );
}

/** "Bug reports: on" in the footer, for everyone, signed in or not; it opens to the same switch. */
export function BugReportsFooter() {
  const on = useReportsOn();
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 underline-offset-2 hover:text-primary hover:underline"
      >
        Anonymous bug reports:
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.b
            key={on ? "on" : "off"}
            initial={{ opacity: 0, y: "0.6em" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "-0.6em" }}
            transition={SPRING}
            className={cn("inline-block", on ? "text-primary" : "text-muted-foreground")}
          >
            {on ? "on" : "off"}
          </motion.b>
        </AnimatePresence>
        <motion.span aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={SPRING} className="inline-block">
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING}
            className="w-full overflow-hidden"
          >
            <div className="pb-1">
              <BugReportsSetting />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
