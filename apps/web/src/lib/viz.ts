/** Small helpers the status and stats pages share. */
import { useViewer } from "./viewer";

/** Whether the theme the site is dressed in is a dark one, from its background. */
export function useDarkTheme(): boolean {
  const hex = useViewer().theme.variant.tokens.background;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! < 0.4;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 3" from "2026-10-03". By hand, so server and browser agree. */
export function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
}

/** "Oct 3, 2026". */
export function longDay(day: string): string {
  return `${shortDay(day)}, ${day.slice(0, 4)}`;
}

/** "Oct 3, 21:04 UTC" from an ISO time. */
export function utcTime(iso: string): string {
  return `${shortDay(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;
}

/** The UTC day `n` days before `day`. */
export function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** "3 h 12 min", "45 min", "2 d 4 h". */
export function duration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

/** 1234 -> "1.2k", 1500000 -> "1.5M". */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${trim(n / 1e9)}B`;
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e4) return `${trim(n / 1e3)}k`;
  return Math.round(n).toLocaleString("en-US");
}
const trim = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ""));

/** Bytes as "12 MB". */
export function bytes(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return `${i === 0 ? n : trim(n)} ${units[i]}`;
}

/** Milliseconds as "320 ms" or "2.5 s". */
export function ms(n: number): string {
  return n >= 1000 ? `${trim(n / 1000)} s` : `${Math.round(n)} ms`;
}

/** 0.99951 -> "99.95%". Never rounds up to 100% unless it is. */
export function percent(share: number): string {
  if (share >= 1) return "100%";
  const floored = Math.floor(share * 10_000) / 100;
  return `${floored.toFixed(2)}%`;
}

/** Up to `count` round numbers from 0 to at least `max`, for an axis. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}
