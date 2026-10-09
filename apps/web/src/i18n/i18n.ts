import { type Catalog, fill, template } from "./core.ts";
import { english, type Namespaces } from "./catalogs.ts";

/** Every key English has, as "namespace.key"; a typo is a type error. */
export type Key = { [N in keyof Namespaces]: `${N & string}.${keyof Namespaces[N] & string}` }[keyof Namespaces];

type Value = string | number;

export type I18n = {
  /** The language the page is in. */
  locale: string;
  dir: "ltr" | "rtl";
  /** A string; `count` picks the plural form and is shown in the language's digits. */
  t: (key: Key, values?: Record<string, Value>) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  date: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
};

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const idOf = (locale: string, options: object | undefined) => `${locale}|${JSON.stringify(options ?? {})}`;
function remember<F>(formats: Map<string, F>, id: string, format: F): F {
  formats.set(id, format);
  return format;
}

/** `locale`'s number format with `options`, built once and reused. */
export function numberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const id = idOf(locale, options);
  return numberFormats.get(id) ?? remember(numberFormats, id, new Intl.NumberFormat(locale, options));
}

/** `locale`'s date format with `options`, built once and reused. */
export function dateFormat(locale: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = idOf(locale, options);
  return dateFormats.get(id) ?? remember(dateFormats, id, new Intl.DateTimeFormat(locale, options));
}

/** Strings, numbers and dates in one language, falling back to English per key. */
export function makeI18n(locale: string, dir: "ltr" | "rtl", catalog: Catalog): I18n {
  const number = (value: number, options?: Intl.NumberFormatOptions) => numberFormat(locale, options).format(value);
  const date = (value: Date | number, options?: Intl.DateTimeFormatOptions) => dateFormat(locale, options).format(value);
  const strings = (values: Record<string, Value> = {}) =>
    Object.fromEntries(Object.entries(values).map(([name, v]) => [name, typeof v === "number" ? number(v) : v]));
  return {
    locale,
    dir,
    number,
    date,
    t: (key, values) => {
      const count = typeof values?.count === "number" ? values.count : undefined;
      return fill(template(locale, catalog, english, key, count), strings(values));
    },
  };
}

/**
 * One string outside React, where there's no provider to ask (page titles: a
 * route's head() runs on its own). Pass the page's catalog, else it's English.
 */
export function translate(locale: string, key: Key, values?: Record<string, Value>, catalog: Catalog = english): string {
  return makeI18n(locale, "ltr", catalog).t(key, values);
}
