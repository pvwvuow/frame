"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  LOCALE_COOKIE,
  LOCALE_META,
  LOCALE_STORAGE_KEY,
  dirOf,
  makeT,
  setActiveLocale,
  type Locale,
  type TFn,
} from "@/lib/i18n";

type Ctx = {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: TFn;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
};

const LocaleContext = createContext<Ctx | null>(null);

export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used inside <LocaleProvider>");
  return ctx;
}

function persist(l: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, l);
  } catch {
    /* private mode */
  }
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  const html = document.documentElement;
  html.lang = LOCALE_META[l].htmlLang;
  html.dir = dirOf(l);
  html.dataset.locale = l;
}

export default function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initial);

  // keep the module-level locale (used by lib/format digits) in sync – during render
  // so the very first client render already formats numbers correctly.
  setActiveLocale(locale);

  useEffect(() => {
    persist(locale);
  }, [locale]);

  const setLocale = useCallback(
    (l: Locale) => {
      if (l === locale) return;
      setActiveLocale(l);
      persist(l);
      setLocaleState(l);
      // re-render server components (headings, metadata) in the new language
      router.refresh();
    },
    [locale, router]
  );

  const toggleLocale = useCallback(() => setLocale(locale === "fa" ? "en" : "fa"), [locale, setLocale]);

  const value = useMemo<Ctx>(
    () => ({ locale, dir: dirOf(locale), t: makeT(locale), setLocale, toggleLocale }),
    [locale, setLocale, toggleLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
