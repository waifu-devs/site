import { AnimatePresence, m as motion } from "motion/react";
import { SLIDE_IN } from "@/lib/motion";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { type Key, T, useI18n } from "@/i18n/react";
import { setReportsOn, useReportsOn } from "@/lib/reports";
import { cn } from "@/lib/utils";

const SENT: Key[] = ["settings.reports.sent1", "settings.reports.sent2", "settings.reports.sent3", "settings.reports.sent4"];
const NEVER: Key[] = ["settings.reports.never1", "settings.reports.never2", "settings.reports.never3"];

const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const;

/** What's sent and what never is, each line easing in after the last. */
function WhatsSent({ dim }: { dim: boolean }) {
  const { t } = useI18n();
  return (
    <motion.div animate={{ opacity: dim ? 0.55 : 1 }} transition={SPRING} className="grid gap-2 text-sm sm:grid-cols-2">
      {[
        { title: t("settings.reports.sentTitle"), lines: SENT, mark: "✓", tone: "text-primary" },
        { title: t("settings.reports.neverTitle"), lines: NEVER, mark: "✕", tone: "text-destructive" },
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
              <span>{t(line)}</span>
            </motion.li>
          ))}
        </ul>
      ))}
    </motion.div>
  );
}

/** The switch, with plainly what it sends: for settings. */
export function BugReportsSetting() {
  const { t } = useI18n();
  const on = useReportsOn();
  return (
    <div className="flex flex-col gap-3 text-left">
      <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
        <span className="grid gap-0.5">
          <span className="text-sm font-bold">{t("settings.reports.switch")}</span>
          <span className="text-xs text-muted-foreground">{t("settings.reports.switchNote")}</span>
        </span>
        <Switch checked={on} onCheckedChange={setReportsOn} aria-label={t("settings.reports.switch")} />
      </label>
      <WhatsSent dim={!on} />
    </div>
  );
}

/** "Bug reports: on" in the footer, for everyone, signed in or not; it opens to the same switch. */
export function BugReportsFooter() {
  const { t } = useI18n();
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
        <T
          k="settings.reports.footer"
          values={{
            state: (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.b
                  key={on ? "on" : "off"}
                  initial={{ opacity: 0, y: "0.6em" }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: "-0.6em" }}
                  transition={SPRING}
                  className={cn("inline-block", on ? "text-primary" : "text-muted-foreground")}
                >
                  {on ? t("settings.reports.on") : t("settings.reports.off")}
                </motion.b>
              </AnimatePresence>
            ),
          }}
        />
        <motion.span aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={SPRING} className="inline-block">
          ▾
        </motion.span>
      </button>
      <AnimatePresence mode="popLayout" initial={false}>
        {open && (
          <motion.div {...SLIDE_IN} transition={SPRING} className="w-full">
            <div className="pb-1">
              <BugReportsSetting />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
