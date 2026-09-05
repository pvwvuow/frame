"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n";
import { GlobeIcon, CheckIcon } from "../Icons";
import { useI18n } from "./LocaleProvider";

/** Navbar pill: current language code + dropdown with all languages. */
export default function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (l: Locale) => {
    setOpen(false);
    setLocale(l);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("nav.switchLanguage")}
        title={t("nav.switchLanguage")}
        className="glass-btn flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold uppercase text-zinc-200 hover:text-white"
      >
        <GlobeIcon width={16} height={16} />
        <span dir="ltr">{locale === "fa" ? "FA" : "EN"}</span>
      </button>
      {open && (
        <ul role="listbox" aria-label={t("common.language")} className="glass-strong glass-in absolute end-0 top-12 z-50 w-44 overflow-hidden rounded-2xl p-1.5">
          {LOCALES.map((l) => {
            const meta = LOCALE_META[l];
            const on = l === locale;
            return (
              <li key={l} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => pick(l)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${on ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"}`}
                >
                  <span className="text-base leading-none">{meta.flag}</span>
                  <span className="flex-1 text-start" dir={meta.dir}>
                    {meta.nativeLabel}
                  </span>
                  {on && <CheckIcon width={14} height={14} className="text-brand" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
