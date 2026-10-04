import { createContext, Fragment, type ReactNode, use, useMemo } from "react";
import { type Catalog, type Entry, parts, template } from "./core.ts";
import { english } from "./catalogs.ts";
import { type I18n, type Key, makeI18n } from "./i18n.ts";

export type { I18n, Key };

const I18nContext = createContext<{ i18n: I18n; catalog: Catalog } | null>(null);

/** Serialized catalog from the root loader: null for English, which every bundle has. */
export type Messages = Record<string, Entry> | null;

export function I18nProvider({ locale, dir, messages, children }: { locale: string; dir: "ltr" | "rtl"; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => {
    const catalog = messages ? new Map(Object.entries(messages)) : english;
    return { i18n: makeI18n(locale, dir, catalog), catalog };
  }, [locale, dir, messages]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

const fallback = { i18n: makeI18n("en", "ltr", english), catalog: english };

/** The page's language, its strings and its number and date formats. */
export function useI18n(): I18n {
  return (use(I18nContext) ?? fallback).i18n;
}

/**
 * A string with page elements in its placeholders, for the few that need bold
 * text or a link inside: <T k="footer.madeWith" values={{ heart: <span>♡</span> }} />.
 * The catalog stays plain text; the elements come from the page.
 */
export function T({ k, values = {} }: { k: Key; values?: Record<string, ReactNode> }) {
  const { i18n, catalog } = use(I18nContext) ?? fallback;
  const count = typeof values.count === "number" ? values.count : undefined;
  const text = template(i18n.locale, catalog, english, k, count);
  return (
    <>
      {parts(text).map((part, n) =>
        typeof part === "string" ? (
          <Fragment key={n}>{part}</Fragment>
        ) : (
          <Fragment key={n}>{Object.hasOwn(values, part.name) ? (typeof values[part.name] === "number" ? i18n.number(values[part.name] as number) : values[part.name]) : `{${part.name}}`}</Fragment>
        ),
      )}
    </>
  );
}
