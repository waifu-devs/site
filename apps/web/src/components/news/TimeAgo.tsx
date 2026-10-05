import { useI18n } from "@/i18n/react";
import { timeAgo } from "./format";

/** A relative time that shows the exact one on hover. Server and browser clocks differ, hence the warning opt-out. */
export function TimeAgo({ date, className }: { date: Date | string; className?: string }) {
  const i18n = useI18n();
  const d = new Date(date);
  return (
    <time dateTime={d.toISOString()} title={i18n.date(d, { dateStyle: "medium", timeStyle: "short" })} className={className} suppressHydrationWarning>
      {timeAgo(d, i18n)}
    </time>
  );
}
