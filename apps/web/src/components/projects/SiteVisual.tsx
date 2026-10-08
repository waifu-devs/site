import { BUILTIN_THEMES, themeStyle } from "@waifu-devs/domain/themes";
import { AnimatePresence, m as motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";

/**
 * A little waifu.dev in a browser window that tries on each built-in theme in
 * turn while it's on screen. The swatches under it pick one directly.
 */
export function SiteVisual() {
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15%" });
  const [i, setI] = useState(0);
  const theme = BUILTIN_THEMES[i];

  useEffect(() => {
    if (!inView || reduce) return;
    const id = setTimeout(() => setI((n) => (n + 1) % BUILTIN_THEMES.length), 2400);
    return () => clearTimeout(id);
  }, [inView, reduce, i]);

  return (
    <div ref={ref} aria-hidden className="relative mx-auto flex w-full max-w-lg select-none flex-col gap-5">
      <div className="absolute inset-[10%] rounded-full bg-primary/25 blur-3xl" />

      <div className="themed relative overflow-hidden rounded-2xl border shadow-2xl" style={themeStyle(theme.variant)}>
        <div className="flex items-center gap-1.5 border-b bg-card px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 min-w-0 flex-1 truncate rounded-full bg-muted px-3 py-0.5 text-[0.65rem] text-muted-foreground">
            www.waifu.dev/u/you
          </span>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-3 text-xs font-extrabold">
            <span>
              <span className="text-primary">♡</span> Waifu Devs
            </span>
            <span className="hidden h-1.5 w-10 rounded-full bg-muted-foreground/40 min-[420px]:block" />
            <span className="hidden h-1.5 w-8 rounded-full bg-muted-foreground/40 min-[420px]:block" />
            <span className="ml-auto rounded-full bg-primary px-3 py-1 text-[0.65rem] text-primary-foreground">{t("common.nav.signIn")}</span>
          </div>

          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="banner h-20">
              {["12%", "34%", "58%", "81%"].map((left, n) => (
                <span key={left} className="banner-star text-xs" style={{ left, top: `${30 + (n % 2) * 30}%`, animationDuration: `${2.4 + n * 0.5}s` }}>
                  ✦
                </span>
              ))}
            </div>
            <div className="relative -mt-7 flex items-end gap-3 px-4">
              <span className="avatar-ring grid size-[4.5rem] shrink-0 place-items-center rounded-full p-[3px]">
                <span className="grid size-full place-items-center rounded-full border-4 border-card bg-primary text-2xl text-primary-foreground">✿</span>
              </span>
              <div className="min-w-0 pb-1">
                <p className="truncate font-extrabold">{t("landing.mock.name")}</p>
                <p className="truncate text-xs text-muted-foreground">{t("landing.mock.pronouns")}</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="status-dot" /> {t("projects.site.mockStatus")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {["♡ open source", "TypeScript", "Effect"].map((chip, n) => (
                  <span
                    key={chip}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold",
                      n === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {BUILTIN_THEMES.map((th, n) => (
            <button
              key={th.id}
              type="button"
              tabIndex={-1}
              onClick={() => setI(n)}
              className={cn(
                "relative size-8 rounded-full border-2 transition-transform duration-300 hover:-translate-y-1 hover:rotate-12",
                n === i ? "border-primary" : "border-card",
              )}
              style={{ background: `linear-gradient(135deg, ${th.variant.tokens.background} 50%, ${th.variant.tokens.primary} 50%)` }}
            >
              {n === i ? <motion.span layoutId="site-swatch-ring" className="absolute -inset-1.5 rounded-full border-2 border-primary/40" /> : null}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 overflow-hidden text-sm font-bold text-muted-foreground">
          {t("projects.site.themeLabel")}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={theme.id}
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="inline-block text-foreground"
            >
              {theme.name}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>
    </div>
  );
}
