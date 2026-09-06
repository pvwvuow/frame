"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon, MonitorIcon } from "../Icons";
import { useI18n } from "../i18n/LocaleProvider";

export const THEMES = [
  { value: "dark", label: "theme.dark", hint: "theme.darkHint", icon: MoonIcon },
  { value: "light", label: "theme.light", hint: "theme.lightHint", icon: SunIcon },
  { value: "system", label: "theme.system", hint: "theme.systemHint", icon: MonitorIcon },
] as const;

const SHORT: Record<string, string> = { dark: "شب", light: "روز", system: "خودکار" };

/**
 * Navbar pill (dark → light → system). Styled like the +/♥ buttons:
 * visible border + subtle fill, colored accent for the active mode.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { t, locale } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = mounted ? theme ?? "dark" : "dark";
  const isLight = mounted && resolvedTheme === "light";
  const next = current === "dark" ? "light" : current === "light" ? "system" : "dark";
  const label = t(THEMES.find((x) => x.value === current)?.label ?? "theme.dark");
  const short = locale === "en" ? (current === "dark" ? "Night" : current === "light" ? "Day" : "Auto") : SHORT[current] ?? "شب";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={t("nav.themeCurrent", { name: label })}
      title={`${t("nav.theme")}: ${label}`}
      className={`relative flex h-10 items-center rounded-full border border-white/15 bg-white/[0.06] pe-4 ps-10 text-xs font-bold text-zinc-200 transition hover:border-white/30 hover:bg-white/10 hover:text-white ${className}`}
    >
      <span className="absolute start-2.5 grid h-5 w-5 place-items-center">
        <span className={`absolute transition-all duration-500 ${isLight ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`}>
          <SunIcon width={16} height={16} className="text-amber-400" />
        </span>
        <span className={`absolute transition-all duration-500 ${!isLight ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0"}`}>
          <MoonIcon width={16} height={16} className="text-sky-300" />
        </span>
      </span>
      <span>{short}</span>
      {mounted && current === "system" && <span className="absolute end-2 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-brand" />}
    </button>
  );
}

/** Segmented control used on the settings page. */
export function ThemeSegment() {
  const { theme, setTheme } = useTheme();
  const { t: tr } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? theme ?? "dark" : "dark";

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {THEMES.map((t) => {
        const Icon = t.icon;
        const active = current === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => setTheme(t.value)}
            aria-pressed={active}
            className={`group relative overflow-hidden rounded-2xl border p-4 text-start transition ${
              active ? "border-brand/60 bg-brand/10 shadow-[0_0_0_1px_var(--color-brand-glow)]" : "border-white/5 bg-white/[0.03] hover:border-white/15"
            }`}
          >
            <div className={`mb-3 h-16 w-full overflow-hidden rounded-xl border ${t.value === "light" ? "border-zinc-300 bg-[#f3f3f7]" : t.value === "dark" ? "border-zinc-700 bg-[#0e0e12]" : "border-zinc-500 bg-gradient-to-l from-[#0e0e12] to-[#f3f3f7]"}`}>
              <div className="flex h-full items-end gap-1 p-2">
                <span className={`h-6 w-4 rounded ${t.value === "dark" ? "bg-white/15" : t.value === "light" ? "bg-black/10" : "bg-white/20"}`} />
                <span className={`h-9 w-4 rounded ${t.value === "dark" ? "bg-white/25" : t.value === "light" ? "bg-black/20" : "bg-black/15"}`} />
                <span className="h-4 w-4 rounded bg-brand" />
              </div>
            </div>
            <span className="flex items-center gap-2 text-sm font-bold text-white">
              <Icon width={16} height={16} className={active ? "text-brand" : "text-zinc-400"} /> {tr(t.label)}
            </span>
            <span className="mt-0.5 block text-[11px] text-zinc-500">{tr(t.hint)}</span>
          </button>
        );
      })}
    </div>
  );
}
