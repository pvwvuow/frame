"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  LOCALE_COOKIE,
  LOCALE_META,
  LOCALE_STORAGE_KEY,
  dirOf,
  isLocale,
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
  /* the persist-on-change effect must not fire for the render that hydrates —
     otherwise it would clobber the user's stored choice before the drift
     check below gets to read it (B-3: the value was ERASED every reload). */
  const firstPersist = useRef(true);

  // keep the module-level locale (used by lib/format digits) in sync – during render
  // so the very first client render already formats numbers correctly.
  setActiveLocale(locale);

  /* B-3 mount reconciliation: the cookie is what the server rendered with, but
     localStorage holds the user's LAST EXPLICIT choice. If they drifted
     (cookie blocked / cleared / stale), localStorage WINS — re-persist so the
     cookie catches up and the next server render matches. */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(stored) && stored !== initial) {
        setActiveLocale(stored);
        setLocaleState(stored);
        persist(stored); // writes BOTH localStorage + nama_locale cookie
      }
    } catch {
      /* private mode */
    }
    // mount-only by design (initial is the server-resolved locale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstPersist.current) {
      firstPersist.current = false;
      return;
    }
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
