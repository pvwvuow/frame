"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon, MonitorIcon } from "../Icons";

export const THEMES = [
  { value: "dark", label: "تیره", hint: "سینمایی و کم‌نور", icon: MoonIcon },
  { value: "light", label: "روشن", hint: "شفاف و پرنور", icon: SunIcon },
  { value: "system", label: "خودکار", hint: "هماهنگ با سیستم", icon: MonitorIcon },
] as const;

/** Small icon button for the navbar – cycles dark → light → system. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = mounted ? theme ?? "dark" : "dark";
  const isLight = mounted && resolvedTheme === "light";
  const next = current === "dark" ? "light" : current === "light" ? "system" : "dark";
  const label = THEMES.find((t) => t.value === current)?.label ?? "تیره";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`تم فعلی: ${label} – تغییر تم`}
      title={`تم: ${label}`}
      className={`glass-btn relative grid h-10 w-10 place-items-center overflow-hidden rounded-full text-zinc-200 transition hover:text-white ${className}`}
    >
      <span className={`absolute transition-all duration-500 ${isLight ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`}>
        <SunIcon width={18} height={18} />
      </span>
      <span className={`absolute transition-all duration-500 ${!isLight ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0"}`}>
        <MoonIcon width={18} height={18} />
      </span>
      {mounted && current === "system" && <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-brand" />}
    </button>
  );
}

/** Segmented control used on the settings page. */
export function ThemeSegment() {
  const { theme, setTheme } = useTheme();
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
              <Icon width={16} height={16} className={active ? "text-brand" : "text-zinc-400"} /> {t.label}
            </span>
            <span className="mt-0.5 block text-[11px] text-zinc-500">{t.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
