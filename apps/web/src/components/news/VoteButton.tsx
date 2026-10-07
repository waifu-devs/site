import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Heart } from "lucide-react";
import { AnimatePresence, m as motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { SlidingNumber } from "@/components/animate-ui/primitives/texts/sliding-number";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { voteTheme } from "@/server/market";
import { votePost } from "@/server/news";

/** What gets the heart: a news post, or a theme in the marketplace. */
export type VoteTarget = { kind: "post" | "theme"; id: string };

type Props = {
  target: VoteTarget;
  score: number;
  voted: boolean;
  /**
   * The viewer made it. A post's author's vote is built in and can't be taken back;
   * a theme's maker can't heart it at all.
   */
  mine: boolean;
  signedIn: boolean;
  className?: string;
};

// What the button says it'll do, by whose it is and whether it's already hearted.
const MODES = {
  mine: { action: "news.vote.yourPost", tip: "news.vote.tipYours" },
  mineTheme: { action: "themes.vote.yourTheme", tip: "themes.vote.tipYours" },
  on: { action: "news.vote.takeBack", tip: "news.vote.tipTakeBack" },
  off: { action: "news.vote.upvote", tip: "news.vote.tipGive" },
} as const;

// Your own post's heart doesn't move: there's nothing to press.
const PRESSABLE = { whileHover: { y: -2 }, whileTap: { scale: 0.88 } };

const pill =
  "relative flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-1 py-2 text-sm font-extrabold tabular-nums transition-colors duration-300";

/**
 * A heart that upvotes. The count updates straight away and rolls to its new value;
 * if the server says no, it rolls back.
 */
export function VoteButton({ target, score, voted, mine, signedIn, className }: Props) {
  const { t } = useI18n();
  const { state, floats, dropFloat, toggle } = useVote(target, score, voted, mine);

  const count = <SlidingNumber number={state.score} initiallyStable className="leading-none" />;

  if (!signedIn) return <SignedOutVote score={state.score} count={count} className={className} />;

  const mode = mine ? (target.kind === "theme" ? MODES.mineTheme : MODES.mine) : state.voted ? MODES.on : MODES.off;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          type="button"
          onClick={toggle}
          aria-pressed={state.voted}
          aria-disabled={mine || undefined}
          aria-label={t("news.vote.label", { count: state.score, action: t(mode.action) })}
          // Sparkle burst (see <Sparkles>) only when giving a heart, not taking it back.
          data-burst={mode === MODES.off ? "" : undefined}
          {...(mine ? {} : PRESSABLE)}
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
          <PoppingHeart voted={state.voted} />
          {count}
          <PlusOnes floats={floats} onDone={dropFloat} />
        </motion.button>
      </TooltipTrigger>
      <TooltipContent>{t(mode.tip)}</TooltipContent>
    </Tooltip>
  );
}

/** The heart, which fills and pops in when given (and just empties when taken back). */
function PoppingHeart({ voted }: { voted: boolean }) {
  return (
    <motion.span
      key={voted ? "on" : "off"}
      initial={{ scale: voted ? 0.4 : 1 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 600, damping: 12 }}
    >
      <Heart className="size-4" fill={voted ? "currentColor" : "none"} />
    </motion.span>
  );
}

/** The vote's optimistic state, the floating "+1"s, and the toggle that talks to the server. */
function useVote(target: VoteTarget, score: number, voted: boolean, mine: boolean) {
  const [state, setState] = useState({ score, voted });
  // Only guards against double clicks, so it never needs a redraw.
  const pending = useRef(false);
  // Each upvote floats a "+1" off the heart; keys let several overlap.
  const [floats, setFloats] = useState<number[]>([]);
  const onPost = useServerFn(votePost);
  const onTheme = useServerFn(voteTheme);
  const vote = (up: boolean) =>
    target.kind === "theme" ? onTheme({ data: { themeId: target.id, up } }) : onPost({ data: { postId: target.id, up } });

  // Fresh numbers from the loader win over what we guessed.
  useEffect(() => setState({ score, voted }), [score, voted]);

  async function toggle() {
    if (pending.current || mine) return;
    const before = state;
    const up = !state.voted;
    setState({ score: state.score + (up ? 1 : -1), voted: up });
    if (up) setFloats((f) => [...f, Date.now()]);
    pending.current = true;
    try {
      setState(await vote(up));
    } catch {
      setState(before);
    } finally {
      pending.current = false;
    }
  }

  const dropFloat = (id: number) => setFloats((f) => f.filter((x) => x !== id));

  return { state, floats, dropFloat, toggle };
}

/** Signed out, the heart is a link to the login page that comes back here. */
function SignedOutVote({ score, count, className }: { score: number; count: React.ReactNode; className?: string }) {
  const { t } = useI18n();
  const location = useLocation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/login"
          search={{ next: location.pathname }}
          aria-label={t("news.vote.signedOutLabel", { count: score })}
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

/** The "+1"s that float up off the heart and fade, each removed once it's done. */
function PlusOnes({ floats, onDone }: { floats: number[]; onDone: (id: number) => void }) {
  return (
    <AnimatePresence>
      {floats.map((id) => (
        <motion.span
          key={id}
          aria-hidden
          initial={{ opacity: 1, y: 0, scale: 0.8 }}
          animate={{ opacity: 0, y: -34, scale: 1.2 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          onAnimationComplete={() => onDone(id)}
          className="pointer-events-none absolute -top-1 text-xs font-extrabold text-primary"
        >
          +1
        </motion.span>
      ))}
    </AnimatePresence>
  );
}
