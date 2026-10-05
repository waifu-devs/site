import { CalendarClock, CircleCheck, CircleDashed, Cloud, Database, Hash, House, Laptop, LoaderCircle, Plus } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { type Key, T, useI18n } from "@/i18n/react";
import type { Project, RoadmapItem, RoadmapState } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { ProjectCard } from "./ProjectCard";

const EASE = [0.22, 1, 0.36, 1] as const;

type Server = {
  glyph: string;
  name: string;
  hosted: boolean;
  /** The server's own SQLite database. */
  file: string;
  channels: string[];
  messages: { author: string; text: Key }[];
};

/** Made-up servers for the demo client: one hosted, two self-hosted. */
const SERVERS: Server[] = [
  {
    glyph: "わ",
    name: "waifu.dev",
    hosted: true,
    file: "waifu-dev.db",
    channels: ["general", "showcase", "help"],
    messages: [
      { author: "mika", text: "projects.fuwa.demo.waifu1" },
      { author: "ren", text: "projects.fuwa.demo.waifu2" },
      { author: "mika", text: "projects.fuwa.demo.waifu3" },
    ],
  },
  {
    glyph: "⌂",
    name: "home-lab",
    hosted: false,
    file: "home-lab.db",
    channels: ["builds", "general", "memes"],
    messages: [
      { author: "you", text: "projects.fuwa.demo.homeLab1" },
      { author: "backup-bot", text: "projects.fuwa.demo.homeLab2" },
      { author: "you", text: "projects.fuwa.demo.homeLab3" },
    ],
  },
  {
    glyph: "✿",
    name: "anime club",
    hosted: false,
    file: "anime-club.db",
    channels: ["watch-party", "spoilers", "general"],
    messages: [
      { author: "aoi", text: "projects.fuwa.demo.club1" },
      { author: "kei", text: "projects.fuwa.demo.club2" },
      { author: "yui", text: "projects.fuwa.demo.club3" },
    ],
  },
];

/** fuwa's card: the demo client and the server diagram share which server is selected. */
export function FuwaProject({ project, index }: { project: Project; index: number }) {
  const [active, setActive] = useState(0);
  return (
    <ProjectCard project={project} index={index} visual={<Client active={active} onSelect={setActive} />}>
      <div className="grid gap-12 border-t p-6 sm:p-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-14">
        <Network active={active} onSelect={setActive} />
        {project.roadmap ? <Roadmap items={project.roadmap} updated={project.roadmapUpdated} /> : null}
      </div>
      {project.roadmap ? <RoadmapLog items={project.roadmap} /> : null}
    </ProjectCard>
  );
}

// Author colors lean on the theme's primary, so the chat suits every theme.
const HUES = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444"];
const authorColor = (name: string) =>
  `color-mix(in srgb, var(--primary) 45%, ${HUES[Array.from(name).reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length]})`;

/**
 * A tiny fuwa desktop client. While it's on screen, messages arrive one at a
 * time, then it hops to the next server in the sidebar. Clicking a server
 * jumps straight to it.
 */
function Client({ active, onSelect }: { active: number; onSelect: (i: number) => void }) {
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15%" });
  const [progress, setProgress] = useState({ server: 0, shown: 0 });
  const server = SERVERS[active];
  const total = server.messages.length;
  const shown = progress.server === active ? progress.shown : 0;

  useEffect(() => {
    // Reduced motion shows the whole conversation at once. It's set here rather than during
    // render so the first render matches the server's.
    if (reduce) {
      if (shown < total) setProgress({ server: active, shown: total });
      return;
    }
    if (!inView) return;
    const id = setTimeout(
      () => (shown < total ? setProgress({ server: active, shown: shown + 1 }) : onSelect((active + 1) % SERVERS.length)),
      shown === 0 ? 500 : shown < total ? 1300 : 3200,
    );
    return () => clearTimeout(id);
  }, [inView, reduce, active, shown, total, onSelect]);

  const typing = !reduce && inView && shown < total ? server.messages[shown].author : null;

  return (
    <div ref={ref} aria-hidden className="relative select-none">
      <div className="absolute inset-[8%] rounded-full bg-primary/25 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border bg-background shadow-2xl shadow-primary/20">
        <div className="flex items-center gap-1.5 border-b bg-card px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 truncate text-xs text-muted-foreground">fuwa · {server.name}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2 text-[0.65rem] font-bold text-muted-foreground">
            <span className="status-dot" /> {t("projects.fuwa.demo.servers", { count: SERVERS.length })}
          </span>
        </div>

        <div className="flex h-[22rem]">
          {/* Server rail */}
          <div className="flex w-[3.75rem] shrink-0 flex-col items-center gap-3 border-r bg-muted/60 py-3">
            {SERVERS.map((s, i) => (
              <button key={s.name} type="button" tabIndex={-1} onClick={() => onSelect(i)} className="relative grid size-10 place-items-center">
                {i === active ? (
                  <motion.span layoutId="fuwa-rail-pill" className="absolute -left-2.5 h-7 w-1 rounded-r-full bg-foreground" />
                ) : null}
                <motion.span
                  animate={{ borderRadius: i === active ? "32%" : "50%" }}
                  whileHover={{ scale: 1.1, borderRadius: "32%" }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className={cn(
                    "grid size-10 place-items-center text-lg font-extrabold transition-colors",
                    i === active ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                  )}
                >
                  {s.glyph}
                </motion.span>
                <span className="absolute -bottom-1 -right-1 grid size-[1.1rem] place-items-center rounded-full border-2 border-muted bg-card text-primary">
                  {s.hosted ? <Cloud className="size-2.5" /> : <House className="size-2.5" />}
                </span>
              </button>
            ))}
            <span className="h-px w-6 bg-border" />
            <span className="grid size-10 place-items-center rounded-full border border-dashed text-muted-foreground">
              <Plus className="size-4" />
            </span>
          </div>

          {/* Channels */}
          <div className="hidden w-40 shrink-0 border-r bg-card/60 sm:block">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="flex h-full flex-col"
              >
                <div className="border-b px-3 py-2.5">
                  <p className="truncate text-sm font-extrabold">{server.name}</p>
                  <p className="flex items-center gap-1 text-[0.65rem] font-bold text-muted-foreground">
                    {server.hosted ? <Cloud className="size-3" /> : <House className="size-3" />}
                    {server.hosted ? t("projects.fuwa.demo.hosted") : t("projects.fuwa.demo.selfHosted")}
                  </p>
                </div>
                <ul className="flex flex-col gap-0.5 p-2 text-sm">
                  {server.channels.map((c, i) => (
                    <li
                      key={c}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2 py-1",
                        i === 0 ? "bg-accent font-bold text-accent-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Hash className="size-3.5 shrink-0 opacity-60" />
                      <span className="truncate">{c}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-auto flex items-center gap-1.5 border-t px-3 py-2 font-mono text-[0.65rem] text-muted-foreground">
                  <Database className="size-3 shrink-0 text-primary" />
                  <span className="truncate">{server.file}</span>
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Messages */}
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="flex items-center gap-1.5 border-b px-4 py-2.5 text-sm font-extrabold">
              <Hash className="size-4 text-muted-foreground" />
              <span className="truncate">{server.channels[0]}</span>
            </p>
            <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-4 py-3">
              <AnimatePresence initial={false} mode="popLayout">
                {server.messages.slice(0, shown).map((m, i) => (
                  <motion.div
                    key={`${active}-${i}`}
                    layout
                    initial={{ opacity: 0, y: 16, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ type: "spring", stiffness: 380, damping: 26 }}
                    className="flex origin-bottom-left gap-2.5"
                  >
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white"
                      style={{ background: authorColor(m.author) }}
                    >
                      {m.author[0].toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold" style={{ color: authorColor(m.author) }}>
                        {m.author}
                      </p>
                      <p className="text-sm leading-snug">{t(m.text)}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <p className={cn("flex h-4 items-center gap-1.5 text-[0.65rem] text-muted-foreground transition-opacity", !typing && "opacity-0")}>
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="truncate">
                  <T k="projects.fuwa.demo.typing" values={{ name: <b>{typing ?? t("projects.fuwa.demo.someone")}</b> }} />
                </span>
              </p>
            </div>
            <div className="px-3 pb-3">
              <p className="truncate rounded-full bg-muted px-4 py-2 text-xs text-muted-foreground">
                {t("projects.fuwa.demo.messagePlaceholder", { channel: server.channels[0] })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * How fuwa fits together: one client wired to every server, each with its own
 * database. Little packets run down the wires; the selected server's wire glows.
 */
function Network({ active, onSelect }: { active: number; onSelect: (i: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-primary">{t("projects.fuwa.network.kicker")}</p>
        <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t("projects.fuwa.network.title")}</h3>
      </div>
      <div className="flex flex-col md:flex-row md:items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="flex w-fit shrink-0 items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-lg shadow-primary/10"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Laptop className="size-5" />
          </span>
          <span>
            <span className="block font-extrabold">{t("projects.fuwa.network.client")}</span>
            <span className="block text-xs text-muted-foreground">{t("projects.fuwa.network.clientWhere")}</span>
          </span>
        </motion.div>
        <span aria-hidden className="wire wire-y ml-[2.2rem] h-8 w-0.5 md:hidden" />
        <span aria-hidden className="wire wire-x hidden h-0.5 w-10 shrink-0 md:block" />
        <ul className="relative ml-[2.2rem] flex min-w-0 flex-col gap-3 md:ml-0 md:flex-1">
          <span aria-hidden className="absolute bottom-8 left-0 top-0 w-0.5 rounded-full bg-border md:top-8" />
          {SERVERS.map((s, i) => (
            <motion.li
              key={s.name}
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15 + i * 0.12, ease: EASE }}
              className="relative pl-6 sm:pl-8"
            >
              <span
                aria-hidden
                data-active={i === active}
                style={{ "--delay": `${i * 0.45}s` } as React.CSSProperties}
                className="wire wire-x absolute left-0 top-1/2 h-0.5 w-6 -translate-y-1/2 sm:w-8"
              />
              <button
                type="button"
                aria-pressed={i === active}
                onClick={() => onSelect(i)}
                className={cn(
                  "flex h-16 w-full items-center gap-3 rounded-2xl border bg-card px-3 text-left transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5",
                  i === active ? "border-primary shadow-lg shadow-primary/20" : "hover:border-primary/50",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full text-base font-extrabold transition-colors",
                    i === active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {s.glyph}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">{s.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {s.hosted ? <Cloud className="size-3 shrink-0" /> : <House className="size-3 shrink-0" />}
                    <span className="truncate">{s.hosted ? t("projects.fuwa.demo.hosted") : t("projects.fuwa.demo.selfHosted")}</span>
                  </span>
                </span>
                <span
                  className={cn(
                    "hidden shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[0.7rem] transition-colors min-[400px]:flex",
                    i === active ? "border-primary/40 bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground",
                  )}
                >
                  <Database className={cn("size-3.5", i === active && "db-pulse")} />
                  {s.file}
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const STATE_ICON = {
  done: <CircleCheck className="mt-px size-5 shrink-0 text-primary" />,
  now: <LoaderCircle className="mt-px size-5 shrink-0 animate-spin text-primary [animation-duration:2.4s]" />,
  next: <CircleDashed className="mt-px size-5 shrink-0 text-muted-foreground/60" />,
};

/** "2026-10-03" as a short date ("Oct 3" in English), read as UTC so the server and the browser agree whatever their time zone. */
function useShortDate() {
  const { date } = useI18n();
  return (iso: string, withYear = false) => {
    const [year, month, day] = iso.split("-").map(Number);
    return date(Date.UTC(year, month - 1, day), { month: "short", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC" });
  };
}

/**
 * Where things stand: how much has shipped, a bar that fills solid for what's
 * done and with moving stripes for what's being built, and what's being built
 * right now.
 */
function Roadmap({ items, updated }: { items: RoadmapItem[]; updated?: string }) {
  const { t } = useI18n();
  const shortDate = useShortDate();
  const count = (state: RoadmapState) => items.filter((item) => item.state === state).length;
  const done = count("done");
  const now = count("now");
  const next = count("next");
  const summary = [
    done && t("projects.fuwa.roadmap.shipped", { count: done }),
    now && t("projects.fuwa.roadmap.building", { count: now }),
    next && t("projects.fuwa.roadmap.upNext", { count: next }),
  ]
    .filter(Boolean)
    .join(" · ");
  const building = items.filter((item) => item.state === "now");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-primary">{t("projects.fuwa.roadmap.kicker")}</p>
        <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t("projects.fuwa.roadmap.title")}</h3>
        <p className="text-sm text-muted-foreground">{summary}</p>
        {/* The track watches the viewport: a bar squashed to nothing never counts as in view. */}
        <motion.div initial="hidden" whileInView="shown" viewport={{ once: true }} className="h-2 overflow-hidden rounded-full bg-muted">
          <motion.div
            variants={{ hidden: { scaleX: 0 }, shown: { scaleX: (done + now) / items.length } }}
            transition={{ duration: 1.2, delay: 0.2, ease: EASE }}
            className="progress-stripes flex h-full origin-left overflow-hidden rounded-full"
          >
            {done ? (
              <span
                className="h-full bg-[linear-gradient(90deg,var(--primary),color-mix(in_srgb,var(--primary)_45%,#a78bfa))]"
                style={{ width: `${(done / (done + now)) * 100}%` }}
              />
            ) : null}
          </motion.div>
        </motion.div>
      </div>
      {building.length ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">{t("projects.fuwa.roadmap.buildingNow")}</p>
          <ol className="flex flex-col gap-3">
            {building.map((item, i) => (
              <motion.li
                key={item.label}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease: EASE }}
                className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-3 text-sm font-bold"
              >
                {STATE_ICON.now}
                <span>{t(item.label)}</span>
              </motion.li>
            ))}
          </ol>
        </div>
      ) : null}
      {updated ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5 shrink-0" />
          <T k="projects.fuwa.roadmap.lastUpdated" values={{ date: <time dateTime={updated}>{shortDate(updated, true)}</time> }} />
        </p>
      ) : null}
    </div>
  );
}

const LOG_LIST = { hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } };
const LOG_ROW = {
  hidden: { opacity: 0, x: -14 },
  shown: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } },
};
const LOG_CHIP = {
  hidden: { opacity: 0, scale: 0.6 },
  shown: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 420, damping: 20 } },
};

/**
 * What's coming after that, and everything that has shipped, newest first on
 * a timeline whose line draws itself down as it scrolls in.
 */
function RoadmapLog({ items }: { items: RoadmapItem[] }) {
  const { t } = useI18n();
  const shortDate = useShortDate();
  const next = items.filter((item) => item.state === "next");
  const shipped = items.filter((item) => item.state === "done");
  // Newest day first, keeping each day's own order.
  const days: { date: string; items: RoadmapItem[] }[] = [];
  for (const item of [...shipped].reverse()) {
    const date = item.date ?? "";
    const day = days.find((d) => d.date === date);
    if (day) day.items.unshift(item);
    else days.push({ date, items: [item] });
  }

  return (
    <div className="grid gap-12 border-t p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-14">
      {next.length ? (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-primary">{t("projects.fuwa.roadmap.next")}</p>
          <motion.ol initial="hidden" whileInView="shown" viewport={{ once: true, margin: "-40px" }} variants={LOG_LIST} className="flex flex-col gap-3">
            {next.map((item) => (
              <motion.li key={item.label} variants={LOG_ROW} className="flex items-start gap-3 text-sm text-muted-foreground">
                {STATE_ICON.next}
                <span>{t(item.label)}</span>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      ) : null}

      {days.length ? (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-primary">{t("projects.fuwa.roadmap.done")}</p>
          {/* The list watches the viewport, so the rows and the line under them start together. */}
          <motion.ol initial="hidden" whileInView="shown" viewport={{ once: true, margin: "-40px" }} variants={LOG_LIST} className="relative flex flex-col gap-6">
            <motion.span
              aria-hidden
              variants={{ hidden: { scaleY: 0 }, shown: { scaleY: 1, transition: { duration: 1.4, ease: EASE } } }}
              className="absolute bottom-2 left-[0.6875rem] top-2 w-0.5 origin-top rounded-full bg-[linear-gradient(var(--primary),color-mix(in_srgb,var(--primary)_20%,transparent))]"
            />
            {days.map((day) => (
              <li key={day.date} className="relative flex flex-col gap-3">
                {day.date ? (
                  <motion.p variants={LOG_CHIP} className="relative flex origin-left items-center gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary ring-4 ring-card">
                      <span className="size-2 rounded-full bg-primary-foreground" />
                    </span>
                    <time dateTime={day.date} className="rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-extrabold text-primary">
                      {shortDate(day.date)}
                    </time>
                  </motion.p>
                ) : null}
                <ul className="flex flex-col gap-2.5 pl-9">
                  {day.items.map((item) => (
                    <motion.li key={item.label} variants={LOG_ROW} className="flex items-start gap-2.5 text-sm">
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{t(item.label)}</span>
                    </motion.li>
                  ))}
                </ul>
              </li>
            ))}
          </motion.ol>
        </div>
      ) : null}
    </div>
  );
}
