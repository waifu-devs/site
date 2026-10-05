import { english } from "@/i18n/catalogs";
import { type Key, translate } from "@/i18n/i18n";
import type { Messages } from "@/i18n/react";

/** The `<title>` for a page, in the site-wide "Page · Waifu Devs" format. */
export const title = (page?: string) => ({ title: page ? `${page} · Waifu Devs` : "Waifu Devs" });

/**
 * Strings for a route's head(), which runs outside React: in the page's
 * language, read from the root loader's data (the first match), so the server
 * and the browser write the same title. Before the root loader has run it's English.
 */
export function headT(matches: ReadonlyArray<{ loaderData?: unknown }>) {
  const root = matches[0]?.loaderData as { language?: { active?: string }; messages?: Messages } | undefined;
  const locale = root?.language?.active ?? "en";
  const catalog = root?.messages ? new Map(Object.entries(root.messages)) : english;
  return (key: Key, values?: Record<string, string | number>) => translate(locale, key, values, catalog);
}
