import { useServerFn } from "@tanstack/react-start";
import type { Repo } from "@waifu-devs/domain/api";
import { MAX_FEATURED_REPOS } from "@waifu-devs/domain/profile";
import { Check, GitFork, GripVertical, RotateCw, Search, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, Reorder, useDragControls } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Language, ownedByOther, Stars } from "@/components/RepoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getRepoChoices } from "@/server/functions";

const pop = { type: "spring", stiffness: 520, damping: 30 } as const;

/** How many matching repos the list draws at once; searching narrows the rest down. */
const SHOWN = 60;

type Choices = { status: "loading" } | { status: "ready"; repos: readonly Repo[] } | { status: "error"; message: string };
type Sort = "recent" | "stars";
const NO_REPOS: readonly Repo[] = [];

/**
 * Picks the public GitHub repos a profile features, and their order. The
 * picked ones sit on top, where they can be dragged (or arrowed) into order;
 * below them is everything the member could feature, searchable, which loads
 * from GitHub once the page is up. The picks travel as hidden `repo` fields,
 * so they save with the rest of the profile.
 */
export function RepoPicker({ value, onChange, username }: { value: readonly Repo[]; onChange: (repos: Repo[]) => void; username: string }) {
  const load = useServerFn(getRepoChoices);
  const [choices, setChoices] = useState<Choices>({ status: "loading" });
  const fetchChoices = useCallback(async () => {
    setChoices({ status: "loading" });
    try {
      const result = await load();
      setChoices(result.error ? { status: "error", message: result.error } : { status: "ready", repos: result.repos });
    } catch {
      setChoices({ status: "error", message: "Your repos didn't load. Try again." });
    }
  }, [load]);
  useEffect(() => void fetchChoices(), [fetchChoices]);

  const full = value.length >= MAX_FEATURED_REPOS;
  const picked = new Set(value.map((repo) => repo.id));
  // Bumped when someone tries to pick one too many, to shake the slots.
  const [nope, setNope] = useState(0);

  const toggle = (repo: Repo) => {
    if (picked.has(repo.id)) onChange(value.filter((r) => r.id !== repo.id));
    else if (full) setNope((n) => n + 1);
    else onChange([...value, repo]);
  };
  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    next.splice(to, 0, ...next.splice(index, 1));
    onChange(next);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-w-0 flex-col gap-5">
        <input type="hidden" name="featured_repos" value="on" />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold">On your profile</span>
            <Slots count={value.length} nope={nope} />
          </div>
          {value.length ? (
            <Reorder.Group axis="y" values={value as Repo[]} onReorder={onChange} className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {value.map((repo, i) => (
                  <PickedRepo
                    key={repo.id}
                    repo={repo}
                    index={i}
                    last={i === value.length - 1}
                    username={username}
                    onMove={(by) => move(i, by)}
                    onRemove={() => toggle(repo)}
                  />
                ))}
              </AnimatePresence>
            </Reorder.Group>
          ) : (
            <motion.p
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 rounded-xl border-2 border-dashed p-4 text-sm text-muted-foreground"
            >
              <span className="float inline-block text-lg text-primary">✦</span>
              Nothing featured yet. Pick up to {MAX_FEATURED_REPOS} repos below and they show on your profile as cards.
            </motion.p>
          )}
          <AnimatePresence>
            {nope > 0 && full ? (
              <motion.p
                key="full"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden text-xs font-bold text-primary"
              >
                That's {MAX_FEATURED_REPOS}! Take one off to make room for another.
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        <ChoiceList choices={choices} picked={picked} full={full} username={username} onToggle={toggle} onRetry={() => void fetchChoices()} />
      </div>
    </MotionConfig>
  );
}

/** One bar per slot; picked ones fill in, and the row shakes when it's full and someone wants more. */
function Slots({ count, nope }: { count: number; nope: number }) {
  return (
    <span key={nope} className={cn("inline-flex items-center gap-1.5", nope > 0 && "nope")} aria-label={`${count} of ${MAX_FEATURED_REPOS} picked`}>
      {Array.from({ length: MAX_FEATURED_REPOS }, (_, i) => (
        <span key={i} aria-hidden className="relative h-1.5 w-4 overflow-hidden rounded-full bg-muted sm:w-5">
          <motion.span
            className="absolute inset-0 origin-left rounded-full bg-primary"
            initial={false}
            animate={{ scaleX: i < count ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
          />
        </span>
      ))}
      <span aria-hidden className="ml-1 text-xs font-bold tabular-nums text-muted-foreground">
        {count}/{MAX_FEATURED_REPOS}
      </span>
    </span>
  );
}

/** A picked repo: drag it by the grip (or focus the grip and use the arrow keys) to reorder. */
function PickedRepo({
  repo,
  index,
  last,
  username,
  onMove,
  onRemove,
}: {
  repo: Repo;
  index: number;
  last: boolean;
  username: string;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const drag = useDragControls();
  const other = ownedByOther(repo, username);
  return (
    <Reorder.Item
      value={repo}
      dragListener={false}
      dragControls={drag}
      initial={{ opacity: 0, scale: 0.85, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, x: 48, transition: { duration: 0.2 } }}
      whileDrag={{ scale: 1.03, rotate: -1, boxShadow: "0 18px 40px -18px var(--primary)" }}
      transition={pop}
      className="relative flex min-w-0 items-center gap-2 rounded-xl border bg-card py-1.5 pr-1.5 pl-1"
    >
      <button
        type="button"
        aria-label={`Move ${repo.name}: drag, or use the up and down arrow keys`}
        onPointerDown={(e) => drag.start(e)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" && index > 0) onMove(-1);
          else if (e.key === "ArrowDown" && !last) onMove(1);
          else return;
          e.preventDefault();
        }}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <motion.span
        key={index}
        initial={{ scale: 0.4, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={pop}
        className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground"
      >
        {index + 1}
      </motion.span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold">
          {other ? <span className="font-normal text-muted-foreground">{repo.owner}/</span> : null}
          {repo.name}
        </span>
        <span className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
          {repo.language ? <Language name={repo.language} /> : null}
          <Stars count={repo.stars} />
        </span>
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Take ${repo.name} off your profile`}
        className="size-8 shrink-0 text-muted-foreground hover:rotate-90 hover:text-destructive"
        onClick={onRemove}
      >
        <X />
      </Button>
      <input type="hidden" name="repo" value={repo.id} />
    </Reorder.Item>
  );
}

/** Everything the member could feature: searchable, filterable by owner, sorted by last push or stars. */
function ChoiceList({
  choices,
  picked,
  full,
  username,
  onToggle,
  onRetry,
}: {
  choices: Choices;
  picked: ReadonlySet<number>;
  full: boolean;
  username: string;
  onToggle: (repo: Repo) => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("recent");
  // One empty list, so the filters below don't rerun on every render while loading.
  const repos = choices.status === "ready" ? choices.repos : NO_REPOS;

  // Organizations, busiest first, for the owner filter.
  const orgs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const repo of repos) if (ownedByOther(repo, username)) counts.set(repo.owner, (counts.get(repo.owner) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([org]) => org);
  }, [repos, username]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const found = repos.filter(
      (repo) =>
        (owner === null || (owner === username ? !ownedByOther(repo, username) : repo.owner === owner)) &&
        (!needle ||
          `${repo.owner}/${repo.name}`.toLowerCase().includes(needle) ||
          repo.description?.toLowerCase().includes(needle) ||
          repo.language?.toLowerCase() === needle ||
          repo.topics.some((topic) => topic.includes(needle))),
    );
    return sort === "stars" ? [...found].sort((a, b) => b.stars - a.stars) : found;
  }, [repos, query, owner, sort, username]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search your repos"
            placeholder="Search your repos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            className="pl-9 transition-all duration-200 focus-visible:-translate-y-0.5"
          />
        </div>
        <Segmented
          name="repo-sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "recent", label: "Recent" },
            { value: "stars", label: "Most stars" },
          ]}
        />
      </div>

      {orgs.length ? (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Show repos from">
          {[null, username, ...orgs].map((who) => (
            <button
              key={who ?? "all"}
              type="button"
              aria-pressed={owner === who}
              onClick={() => setOwner(who)}
              className={cn(
                "relative shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition-[color,border-color,translate] duration-200 hover:-translate-y-0.5 active:scale-95",
                owner === who ? "border-primary text-primary-foreground" : "text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              {owner === who ? <motion.span layoutId="repo-owner" transition={pop} className="absolute inset-0 rounded-full bg-primary" /> : null}
              <span className="relative">{who === null ? "All" : who === username ? "Yours" : who}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="max-h-80 min-h-40 overflow-y-auto overscroll-contain rounded-xl border p-1">
        {choices.status === "loading" ? (
          <ul aria-label="Loading your repos" className="flex flex-col gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="shimmer size-5 shrink-0 rounded-full" />
                <span className="flex flex-1 flex-col gap-1.5">
                  <span className="shimmer h-3 rounded-full" style={{ width: `${45 + ((i * 17) % 35)}%` }} />
                  <span className="shimmer h-2.5 w-3/4 rounded-full opacity-70" />
                </span>
              </li>
            ))}
          </ul>
        ) : choices.status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-sm text-muted-foreground">
            <p>{choices.message}</p>
            <Button type="button" variant="outline" size="sm" className="btn group/retry rounded-full font-bold" onClick={onRetry}>
              <RotateCw className="transition-transform duration-500 group-hover/retry:rotate-180" /> Try again
            </Button>
          </div>
        ) : matches.length ? (
          <ul className="flex flex-col gap-0.5">
            {matches.slice(0, SHOWN).map((repo, i) => (
              <Choice key={repo.id} repo={repo} index={i} selected={picked.has(repo.id)} full={full} username={username} onToggle={onToggle} />
            ))}
            {matches.length > SHOWN ? (
              <li className="px-3 py-2 text-center text-xs text-muted-foreground">
                Showing {SHOWN} of {matches.length}. Search to find the rest.
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {repos.length ? <>No repo matches “{query.trim()}”.</> : "GitHub doesn't list any public repos for you yet. (´・ω・`)"}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Public repos you own, and those of organizations you're a public member of on GitHub.</p>
    </div>
  );
}

function Choice({
  repo,
  index,
  selected,
  full,
  username,
  onToggle,
}: {
  repo: Repo;
  index: number;
  selected: boolean;
  full: boolean;
  username: string;
  onToggle: (repo: Repo) => void;
}) {
  const other = ownedByOther(repo, username);
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.025, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onToggle(repo)}
        className={cn(
          "group/repo flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          selected ? "bg-primary/10" : "hover:bg-accent",
          full && !selected && "opacity-60",
        )}
      >
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-[border-color,background-color,scale] duration-200 group-active/repo:scale-90",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 group-hover/repo:border-primary",
          )}
        >
          <AnimatePresence initial={false}>
            {selected ? (
              <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={pop}>
                <Check className="size-3" strokeWidth={3.5} />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
            <span className="truncate">
              {other ? <span className="font-normal text-muted-foreground">{repo.owner}/</span> : null}
              {repo.name}
            </span>
            {repo.fork ? <GitFork aria-label="Fork" className="size-3 shrink-0 text-muted-foreground" /> : null}
            {repo.archived ? <span className="shrink-0 rounded-full border px-1.5 text-[10px] font-bold text-muted-foreground">Archived</span> : null}
          </span>
          {repo.description ? <span className="truncate text-xs text-muted-foreground">{repo.description}</span> : null}
        </span>
        <span className="hidden shrink-0 items-center gap-3 text-xs font-bold text-muted-foreground min-[420px]:flex">
          {repo.language ? <Language name={repo.language} className="max-w-24" /> : null}
          <Stars count={repo.stars} />
        </span>
      </button>
    </motion.li>
  );
}

/** A two-way switch whose highlight slides between the options. */
function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label="Sort by" className="flex shrink-0 self-start rounded-full border bg-muted/60 p-0.5 sm:self-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "relative cursor-pointer rounded-full px-3 py-1 text-xs font-bold transition-colors",
            value === option.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === option.value ? <motion.span layoutId={name} transition={pop} className="absolute inset-0 rounded-full bg-primary shadow-sm" /> : null}
          <span className="relative">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
