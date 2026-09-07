"use client";

/* Quality preference picker (v0.10.19) — the «پیش‌فرض پخش» selector on the
 * movie/series page. The user picks the quality ONCE, before playing, and
 * every episode they click afterwards starts with THAT quality (not the
 * archive default). Stored globally (localStorage) and applied by the
 * theater player + floating windows via variant.ts. */
import { useEffect, useState } from "react";
import { CheckIcon, GaugeIcon } from "../Icons";
import { useI18n } from "../i18n/LocaleProvider";
import { getQualityPref, QUALITY_PREF_EVENT, setQualityPref } from "@/lib/quality-pref";

export default function QualityPrefPicker({ qualities }: { qualities: string[] }) {
  const { t } = useI18n();
  const [pref, setPref] = useState("best");

  useEffect(() => {
    setPref(getQualityPref());
    const onChange = () => setPref(getQualityPref());
    window.addEventListener(QUALITY_PREF_EVENT, onChange);
    try {
      window.addEventListener("storage", onChange);
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener(QUALITY_PREF_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const options = ["best", ...qualities.filter((q) => q && q.toLowerCase() !== "عادی")];
  if (options.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-400">
        <GaugeIcon width={14} height={14} className="text-brand" />
        {t("dl.prefLabel")}
      </span>
      {options.map((q) => {
        const on = pref === q;
        return (
          <button
            key={q}
            type="button"
            onClick={() => {
              setQualityPref(q);
              setPref(q);
            }}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
              on
                ? "border-brand bg-brand text-white shadow-[0_6px_24px_var(--color-brand-glow)]"
                : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/25 hover:text-white"
            }`}
          >
            {on && <CheckIcon width={12} height={12} />}
            {q === "best" ? t("dl.prefBest") : q}
          </button>
        );
      })}
    </div>
  );
}
