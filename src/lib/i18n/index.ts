import { dictionaries, type Dictionary } from "./dictionaries";

export type Locale = "fa" | "en";
export const LOCALES: Locale[] = ["fa", "en"];
export const DEFAULT_LOCALE: Locale = "fa";
export const LOCALE_COOKIE = "nama_locale";
export const LOCALE_STORAGE_KEY = "nama:locale";

export const LOCALE_META: Record<Locale, { label: string; nativeLabel: string; dir: "rtl" | "ltr"; flag: string; htmlLang: string }> = {
  fa: { label: "Persian", nativeLabel: "فارسی", dir: "rtl", flag: "🇮🇷", htmlLang: "fa" },
  en: { label: "English", nativeLabel: "English", dir: "ltr", flag: "🇬🇧", htmlLang: "en" },
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as string[]).includes(v);
}

export function dirOf(locale: Locale) {
  return LOCALE_META[locale].dir;
}

/* ------------------------------------------------------------------ */
/* Active locale                                                       */
/* On the client this is set once by <LocaleProvider>. On the server   */
/* it is set per request by getLocale() (called at the top of layout   */
/* and by every server page through getT()). Number formatting helpers */
/* in lib/format.ts read it so digits follow the UI language.          */
/* ------------------------------------------------------------------ */
let active: Locale = DEFAULT_LOCALE;

export function setActiveLocale(l: Locale) {
  active = l;
}
export function getActiveLocale(): Locale {
  return active;
}

/* ------------------------------------------------------------------ */
/* Translation                                                         */
/* ------------------------------------------------------------------ */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TKey = Leaves<Dictionary>;
export type TParams = Record<string, string | number>;

function lookup(dict: Dictionary, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(s: string, params?: TParams) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

export function translate(locale: Locale, key: TKey, params?: TParams): string {
  const s = lookup(dictionaries[locale], key) ?? lookup(dictionaries.fa, key) ?? key;
  return interpolate(s, params);
}

export function makeT(locale: Locale) {
  return (key: TKey, params?: TParams) => translate(locale, key, params);
}
export type TFn = ReturnType<typeof makeT>;

/** Translate using the currently active locale (client helpers, format utils). */
export function t(key: TKey, params?: TParams) {
  return translate(active, key, params);
}
