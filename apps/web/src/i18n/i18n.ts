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

const formats = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function cached<F extends Intl.NumberFormat | Intl.DateTimeFormat>(kind: string, locale: string, options: object | undefined, make: () => F): F {
  const id = `${kind}|${locale}|${JSON.stringify(options ?? {})}`;
  let format = formats.get(id) as F | undefined;
  if (!format) formats.set(id, (format = make()));
  return format;
}

/** Strings, numbers and dates in one language, falling back to English per key. */
export function makeI18n(locale: string, dir: "ltr" | "rtl", catalog: Catalog): I18n {
  const number = (value: number, options?: Intl.NumberFormatOptions) =>
    cached("n", locale, options, () => new Intl.NumberFormat(locale, options)).format(value);
  const date = (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
    cached("d", locale, options, () => new Intl.DateTimeFormat(locale, options)).format(value);
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

