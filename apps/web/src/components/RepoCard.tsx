import type { Repo } from "@waifu-devs/domain/api";
import { ArrowUpRight, BookMarked, GitFork, Star } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { GitHubMark } from "@/components/projects/ProjectCard";
import { useI18n } from "@/i18n/react";
import { languageColor } from "@/lib/languages";
import { cn } from "@/lib/utils";

const COMPACT = { notation: "compact", maximumFractionDigits: 1 } as const;

export const repoUrl = (repo: Pick<Repo, "owner" | "name">) => `https://github.com/${repo.owner}/${repo.name}`;

/** Whether a repo belongs to someone other than `username` (an organization, usually). */
export const ownedByOther = (repo: Pick<Repo, "owner">, username: string) => repo.owner.toLowerCase() !== username.toLowerCase();

/** A language's GitHub color as a dot, and its name. */
export function Language({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span aria-hidden className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10" style={{ background: languageColor(name) }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** The star count, with a star that spins and fills in when its card (a `group/repo`) is hovered. */
export function Stars({ count }: { count: number }) {
  const { t, number } = useI18n();
  return (
    <span className="inline-flex items-center gap-1" title={t("profile.repo.stars", { count })}>
      <Star className="size-3.5 transition-[rotate,scale,color,fill] duration-500 ease-[cubic-bezier(0.3,1.6,0.5,1)] group-hover/repo:rotate-[144deg] group-hover/repo:scale-125 group-hover/repo:fill-primary group-hover/repo:text-primary" />
      {/* 1234 reads as 1.2K. */}
      {number(count, COMPACT)}
    </span>
  );
}

/**
 * A featured repo on a profile, drawn from the profile's theme tokens. The
 * whole card links to the repo on GitHub, and a glow follows the pointer
 * around its border.
 */
export function RepoCard({ repo, username, dense = false }: { repo: Repo; username: string; dense?: boolean }) {
  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  const { t, number } = useI18n();
  const other = ownedByOther(repo, username);
  return (
    <a
      href={repoUrl(repo)}
      target="_blank"
      rel="noopener noreferrer"
      onPointerMove={onPointerMove}
      className={cn(
        "spotlight repo-card group/repo flex h-full min-w-0 flex-col rounded-2xl border bg-card text-card-foreground shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        dense ? "gap-2 p-3" : "gap-3 p-4",
      )}
    >
      <span className="flex items-start gap-2.5">
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-xl bg-primary/12 text-primary transition-colors duration-300 group-hover/repo:bg-primary group-hover/repo:text-primary-foreground",
            dense ? "size-7" : "size-9",
          )}
        >
          <BookMarked className={cn("group-hover/repo:animate-[wiggle_0.5s_ease-in-out]", dense ? "size-3.5" : "size-4")} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {other ? <span className="truncate text-xs text-muted-foreground">{repo.owner}</span> : null}
          <span className={cn("truncate font-extrabold leading-snug", dense ? "text-sm" : "text-base", !other && !dense && "mt-1")}>{repo.name}</span>
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-[translate,color] duration-300 group-hover/repo:translate-x-0.5 group-hover/repo:-translate-y-0.5 group-hover/repo:text-primary" />
      </span>

      {repo.description ? (
        <span className={cn("break-words text-muted-foreground", dense ? "line-clamp-1 text-xs" : "line-clamp-2 text-sm")}>{repo.description}</span>
      ) : null}

      {!dense && repo.topics.length ? (
        <span className="flex flex-wrap gap-1.5">
          {repo.topics.slice(0, 3).map((topic) => (
            <span key={topic} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              {topic}
            </span>
          ))}
        </span>
      ) : null}

      <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-muted-foreground">
        {repo.language ? <Language name={repo.language} /> : null}
        <Stars count={repo.stars} />
        {repo.forks && !dense ? (
          <span className="inline-flex items-center gap-1" title={t("profile.repo.forks", { count: repo.forks })}>
            <GitFork className="size-3.5" />
            {number(repo.forks, COMPACT)}
          </span>
        ) : null}
        {repo.fork ? <span className="rounded-full border px-2 py-px text-[11px]">{t("profile.repo.fork")}</span> : null}
        {repo.archived ? <span className="rounded-full border px-2 py-px text-[11px]">{t("profile.repo.archived")}</span> : null}
      </span>
    </a>
  );
}

/** A profile's featured repos: cards that spring up one after another as they scroll in (or just fade in, for reduced motion). */
export function FeaturedRepos({ repos, username }: { repos: readonly Repo[]; username: string }) {
  const { t } = useI18n();
  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="featured-repos" className="flex flex-col gap-3">
        <h2 id="featured-repos" className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <GitHubMark className="size-4" /> {t("profile.repo.featured")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {repos.map((repo, i) => (
            <motion.li
              key={repo.id}
              initial={{ opacity: 0, y: 26, scale: 0.96, rotate: i % 2 ? 1.2 : -1.2 }}
              whileInView={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.06 * i }}
              className="min-w-0"
            >
              <RepoCard repo={repo} username={username} />
            </motion.li>
          ))}
        </ul>
      </section>
    </MotionConfig>
  );
}
