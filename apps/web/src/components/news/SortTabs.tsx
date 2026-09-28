import { Link } from "@tanstack/react-router";
import type { PostSort } from "@waifu-devs/domain/api";
import { Flame, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const TABS: Array<{ sort: PostSort; label: string; Icon: typeof Flame }> = [
  { sort: "top", label: "Top", Icon: Flame },
  { sort: "new", label: "New", Icon: Sparkles },
];

/** Top / New, with a pill that slides to whichever is picked. */
export function SortTabs({ sort }: { sort: PostSort }) {
  return (
    <nav aria-label="Sort posts" className="inline-flex rounded-full border bg-card/80 p-1 shadow-sm backdrop-blur">
      {TABS.map(({ sort: value, label, Icon }) => {
        const active = value === sort;
        return (
          <Link
            key={value}
            to="/news"
            search={value === "top" ? {} : { sort: value }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-primary",
            )}
          >
            {active ? (
              <motion.span
                layoutId="news-sort-pill"
                className="absolute inset-0 -z-0 rounded-full bg-primary shadow-[0_6px_18px_-8px_var(--primary)]"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ) : null}
            <Icon className="relative size-4 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
