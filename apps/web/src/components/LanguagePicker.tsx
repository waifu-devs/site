import { useRouter } from "@tanstack/react-router";
import { Check, Languages } from "lucide-react";
import { AnimatePresence, LayoutGroup, m as motion } from "motion/react";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { coverage, LANGUAGES, languageOf, loadCatalog } from "@/i18n/catalogs";
import { useI18n } from "@/i18n/react";
import { pickLanguage } from "@/server/functions";

const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const;

export type LanguageState = { choice: string; detected: string; active: string };

// The language being switched to, shared so the page can dim while the new strings arrive.
let switching: string | null = null;
const listeners = new Set<() => void>();
const setSwitching = (code: string | null) => {
  switching = code;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The language being switched to, or null. */
export const useSwitchingLanguage = () =>
  useSyncExternalStore(
    subscribe,
    () => switching,
    () => null,
  );

/** Picks a language: remembered by the server for this browser, then the page re-renders in it. */
function useLanguagePick() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const pick = async (code: string) => {
    setFailed(false);
    setSwitching(code);
    try {
      await pickLanguage({ data: code });
      await router.invalidate();
    } catch {
      setFailed(true);
    } finally {
      setSwitching(null);
    }
  };
  return { pick, failed };
}

/** Each shipped language's share of English, once the list is open (they're small, same-origin files). */
function useCoverage() {
  const [shares, setShares] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    for (const { code } of LANGUAGES) {
      if (code === "en") continue;
      loadCatalog(code)
        .then((catalog) => live && setShares((s) => ({ ...s, [code]: coverage(catalog) })))
        .catch(() => {});
    }
    return () => void (live = false);
  }, []);
  return shares;
}

type Row = { id: string; name: string; note: string | null; warn: string | null };

/** Every language the site ships, by its own name, with "match my browser" first. */
export function LanguagePicker({ language }: { language: LanguageState }) {
  const { t, number } = useI18n();
  const { pick, failed } = useLanguagePick();
  const pending = useSwitchingLanguage();
  const shares = useCoverage();
  const group = useId();
  const rows: Row[] = [
    {
      id: "auto",
      name: t("common.language.matchBrowser"),
      note: t("common.language.matchBrowserNote", { language: languageOf(language.detected).name }),
      warn: null,
    },
    ...LANGUAGES.map((l) => {
      const share = shares[l.code];
      const notes = [l.english !== l.name ? l.english : null, share !== undefined && share < 1 ? t("common.language.coverage", { percent: number(share, { style: "percent" }) }) : null];
      return { id: l.code, name: l.name, note: notes.filter(Boolean).join(" · ") || null, warn: l.reviewed ? null : t("common.language.draft") };
    }),
  ];
  const selected = pending ?? language.choice;
  return (
    <div className="flex flex-col gap-2 text-start">
      <LayoutGroup id={group}>
        <div role="radiogroup" aria-label={t("common.language.title")} className="flex flex-col gap-1">
          {rows.map((row) => {
            const on = row.id === selected;
            return (
              <button
                key={row.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={pending !== null}
                lang={row.id === "auto" ? undefined : row.id}
                onClick={() => row.id !== language.choice && pick(row.id)}
                className="relative flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-muted/60 disabled:cursor-progress"
              >
                {on && <motion.span layoutId="language-highlight" transition={SPRING} className="absolute inset-0 rounded-xl bg-primary/10 ring-1 ring-primary/30" />}
                <span className="relative grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm font-bold">{row.name}</span>
                  {row.note && <span className="text-xs text-muted-foreground">{row.note}</span>}
                  {row.warn && <span className="text-xs text-amber-600 dark:text-amber-400">{row.warn}</span>}
                </span>
                <span className="relative grid size-5 shrink-0 place-items-center">
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.span
                        key="check"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: pending === row.id ? [1, 0.4, 1] : 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={pending === row.id ? { ...SPRING, opacity: { repeat: Infinity, duration: 0.9 } } : SPRING}
                        className="text-primary"
                      >
                        <Check className="size-4" strokeWidth={3} aria-hidden />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
      <AnimatePresence initial={false}>
        {failed && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
            className="px-3 text-xs text-destructive"
          >
            {t("common.language.failed")}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "Language: English" in the footer, for everyone, signed in or not; it opens to the picker. */
export function LanguageFooter({ language }: { language: LanguageState }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 px-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 underline-offset-2 hover:text-primary hover:underline"
      >
        <Languages className="size-3.5" aria-hidden />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={language.active}
            initial={{ opacity: 0, y: "0.6em" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "-0.6em" }}
            transition={SPRING}
            className="inline-block"
          >
            {t("common.language.button", { language: languageOf(language.active).name })}
          </motion.span>
        </AnimatePresence>
        <motion.span aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={SPRING} className="inline-block">
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={SPRING}
            className="w-full origin-top rounded-2xl border bg-card/80 p-1.5"
          >
            <LanguagePicker language={language} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
