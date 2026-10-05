import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Heart } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { SlidingNumber } from "@/components/animate-ui/primitives/texts/sliding-number";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { votePost } from "@/server/news";

type Props = {
  postId: string;
  score: number;
  voted: boolean;
  /** The viewer wrote it: their vote is built in and can't be taken back. */
  mine: boolean;
  signedIn: boolean;
  className?: string;
};

const pill =
  "relative flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-1 py-2 text-sm font-extrabold tabular-nums transition-colors duration-300";

/**
 * A heart that upvotes. The count updates straight away and rolls to its new value;
 * if the server says no, it rolls back.
 */
export function VoteButton({ postId, score, voted, mine, signedIn, className }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState({ score, voted });
  const [pending, setPending] = useState(false);
  // Each upvote floats a "+1" off the heart; keys let several overlap.
  const [floats, setFloats] = useState<number[]>([]);
  const vote = useServerFn(votePost);
  const location = useLocation();

  // Fresh numbers from the loader win over what we guessed.
  useEffect(() => setState({ score, voted }), [score, voted]);

  const count = <SlidingNumber number={state.score} initiallyStable className="leading-none" />;

  if (!signedIn) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/login"
            search={{ next: location.pathname }}
            aria-label={t("news.vote.signedOutLabel", { count: state.score })}
            className={cn(pill, "bg-card text-muted-foreground hover:border-primary hover:text-primary", className)}
          >
            <Heart className="size-4" />
            {count}
          </Link>
        </TooltipTrigger>
        <TooltipContent>{t("news.vote.signIn")}</TooltipContent>
      </Tooltip>
    );
  }

  async function toggle() {
    if (pending || mine) return;
    const before = state;
    const up = !state.voted;
    setState({ score: state.score + (up ? 1 : -1), voted: up });
    if (up) setFloats((f) => [...f, Date.now()]);
    setPending(true);
    try {
      setState(await vote({ data: { postId, up } }));
    } catch {
      setState(before);
    } finally {
      setPending(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          type="button"
          onClick={toggle}
          aria-pressed={state.voted}
          aria-disabled={mine || undefined}
          aria-label={t("news.vote.label", {
            count: state.score,
            action: mine ? t("news.vote.yourPost") : state.voted ? t("news.vote.takeBack") : t("news.vote.upvote"),
          })}
          // Sparkle burst (see <Sparkles>) only when giving a heart, not taking it back.
          data-burst={!state.voted && !mine ? "" : undefined}
          whileHover={mine ? undefined : { y: -2 }}
          whileTap={mine ? undefined : { scale: 0.88 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
          className={cn(
            pill,
            state.voted
              ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_22px_-10px_var(--primary)]"
              : "bg-card text-muted-foreground hover:border-primary hover:text-primary",
            mine ? "cursor-default" : "cursor-pointer",
            className,
          )}
        >
          <motion.span
            key={state.voted ? "on" : "off"}
            initial={{ scale: state.voted ? 0.4 : 1 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 12 }}
          >
            <Heart className="size-4" fill={state.voted ? "currentColor" : "none"} />
          </motion.span>
          {count}
          <AnimatePresence>
            {floats.map((id) => (
              <motion.span
                key={id}
                aria-hidden
                initial={{ opacity: 1, y: 0, scale: 0.8 }}
                animate={{ opacity: 0, y: -34, scale: 1.2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                onAnimationComplete={() => setFloats((f) => f.filter((x) => x !== id))}
                className="pointer-events-none absolute -top-1 text-xs font-extrabold text-primary"
              >
                +1
              </motion.span>
            ))}
          </AnimatePresence>
        </motion.button>
      </TooltipTrigger>
      <TooltipContent>{mine ? t("news.vote.tipYours") : state.voted ? t("news.vote.tipTakeBack") : t("news.vote.tipGive")}</TooltipContent>
    </Tooltip>
  );
}
