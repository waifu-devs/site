/** Small helpers for the stats page. */
import { useMemo } from "react";
import { useI18n } from "@/i18n/react";
import { useViewer } from "./viewer";

/** Whether the theme the site is dressed in is a dark one, from its background. */
export function useDarkTheme(): boolean {
  const hex = useViewer().theme.variant.tokens.background;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! < 0.4;
}

const formats = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function cached<F extends Intl.NumberFormat | Intl.DateTimeFormat>(id: string, make: () => F): F {
  let format = formats.get(id) as F | undefined;
  if (!format) formats.set(id, (format = make()));
  return format;
}

/** "Oct 3" from "2026-10-03", in `locale`. Read as UTC, so server and browser agree. */
export function shortDay(day: string, locale: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const format = cached(`day|${locale}`, () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }));
  return format.format(Date.UTC(y!, m! - 1, d!));
}

/** The UTC day `n` days before `day`. */
export function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** A number with at most one decimal under 100 and none above, in `locale`'s digits. */
function trim(n: number, locale: string): string {
  const digits = Math.abs(n) >= 100 ? 0 : 1;
  return cached(`trim|${locale}|${digits}`, () => new Intl.NumberFormat(locale, { maximumFractionDigits: digits })).format(n);
}

/** 1234 -> "1,234", 12345 -> "12.3K", 1500000 -> "1.5M" (in English). */
export function compact(n: number, locale: string): string {
  if (Math.abs(n) < 1e4) return cached(`int|${locale}`, () => new Intl.NumberFormat(locale)).format(Math.round(n));
  return cached(`compact|${locale}`, () => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })).format(n);
}

/** Bytes as "12 MB". */
export function bytes(n: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return `${i === 0 ? compact(n, locale) : trim(n, locale)} ${units[i]}`;
}

/** Milliseconds as "320 ms" or "2.5 s". */
export function ms(n: number, locale: string): string {
  return n >= 1000 ? `${trim(n / 1000, locale)} s` : `${compact(Math.round(n), locale)} ms`;
}

/** The formatters above, in the page's language. */
export function useFormats() {
  const { locale } = useI18n();
  return useMemo(
    () => ({
      shortDay: (day: string) => shortDay(day, locale),
      compact: (n: number) => compact(n, locale),
      bytes: (n: number) => bytes(n, locale),
      ms: (n: number) => ms(n, locale),
    }),
    [locale],
  );
}

/** Up to `count` round numbers from 0 to at least `max`, for an axis. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}
