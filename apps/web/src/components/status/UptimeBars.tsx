import type { StatusDay } from "@waifu-devs/domain/api";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { addDays, longDay, ms, percent } from "@/lib/viz";

/** How a day went: every check answered quickly, some trouble, real trouble, or never checked. */
type DayLevel = "good" | "warning" | "critical" | "none";

function levelOf(day: StatusDay | undefined): DayLevel {
  if (!day || day.checks === 0) return "none";
  const up = day.up / day.checks;
  if (up < 0.99) return "critical";
  if (up < 0.999 || day.slow / day.checks > 0.1) return "warning";
  return "good";
}

const COLOR: Record<DayLevel, string> = {
  good: "var(--good)",
  warning: "var(--warning)",
  critical: "var(--critical)",
  none: "var(--no-data)",
};

const WORD: Record<DayLevel, string> = {
  good: "Running",
  warning: "Some trouble",
  critical: "Down for a while",
  none: "Not checked",
};

/**
 * One bar per day for the last `window` days, today on the right. Pointing at
 * (or tapping, or arrowing to) a bar shows that day. One listener for the whole
 * strip, not one per bar. Phones show the last 30 days.
 */
export function UptimeBars({ days, today, window, name }: { days: readonly StatusDay[]; today: string; window: number; name: string }) {
  const slots = useMemo(() => {
    const byDay = new Map(days.map((d) => [d.day, d]));
    return Array.from({ length: window }, (_, i) => {
      const day = addDays(today, i - window + 1);
      return { day, data: byDay.get(day) };
    });
  }, [days, today, window]);
  const strip = useRef<HTMLDivElement>(null);
  // The day pointed at, and the middle of its bar (px from the strip's left).
  const [selected, setSelected] = useState<{ index: number; x: number } | null>(null);
  const active = selected?.index ?? null;

  /** The bars showing at this width (phones hide the older ones). */
  const visible = () => Array.from(strip.current?.querySelectorAll<HTMLElement>("[data-bar]") ?? []).filter((bar) => bar.offsetWidth > 0);
  const select = (bar: HTMLElement | undefined) => {
    if (bar) setSelected({ index: Number(bar.dataset.bar), x: bar.offsetLeft + bar.offsetWidth / 2 });
  };

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const bars = visible();
    select(bars.find((bar) => event.clientX <= bar.getBoundingClientRect().right + 1) ?? bars.at(-1));
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    const bars = visible();
    const now = bars.findIndex((bar) => Number(bar.dataset.bar) === active);
    select(bars[Math.min(bars.length - 1, Math.max(0, now === -1 ? bars.length - 1 : now + step))]);
  };

  const shown = active === null ? null : slots[active];
  const level = levelOf(shown?.data);

  return (
    <div className="relative">
      <div
        ref={strip}
        role="img"
        tabIndex={0}
        aria-label={`${name}: the last ${window} days. Use the arrow keys to read each day.`}
        className="flex h-9 touch-pan-y items-end gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setSelected(null)}
        onBlur={() => setSelected(null)}
        onKeyDown={keys}
      >
        {slots.map((slot, i) => (
          <span
            key={slot.day}
            data-bar={i}
            data-active={active === i ? "" : undefined}
            // Phones show the last 30 days.
            className={cn("uptime-bar h-full min-w-0 flex-1 rounded-[3px]", i < window - 30 && "max-sm:hidden")}
            style={{ background: COLOR[levelOf(slot.data)], ["--i" as string]: i, ["--j" as string]: i - (window - 30) }}
          />
        ))}
      </div>
      <div
        aria-live="polite"
        className={cn(
          "viz-tip pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-[15rem] -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg",
          shown ? "opacity-100" : "opacity-0",
        )}
        // Over the bar, kept inside the strip.
        style={{ left: `clamp(7.5rem, ${selected?.x ?? 0}px, calc(100% - 7.5rem))` }}
      >
        {shown && (
          <>
            <p className="font-bold">{longDay(shown.day)}</p>
            <p className="mt-1 flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: COLOR[level] }} />
              {WORD[level]}
            </p>
            {shown.data && shown.data.checks > 0 ? (
              <p className="mt-1 text-muted-foreground">
                {percent(shown.data.up / shown.data.checks)} of {shown.data.checks.toLocaleString("en-US")} checks answered
                {shown.data.avgMs !== null && <> · {ms(shown.data.avgMs)} on average</>}
                {shown.data.slow > 0 && <> · {shown.data.slow} slow</>}
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">No checks that day.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function LevelKey() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(["good", "warning", "critical", "none"] as const).map((level) => (
        <span key={level} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: COLOR[level] }} />
          {WORD[level]}
        </span>
      ))}
    </div>
  );
}
