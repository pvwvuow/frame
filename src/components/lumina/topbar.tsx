"use client";

import { Search, Bell, MonitorPlay } from "lucide-react";
import { GENRE_CHIPS } from "@/lib/titles";

/* Sticky glass command bar — search + genre pills + quality badge */

export function CommandBar({
  genre,
  onGenre,
}: {
  genre: string;
  onGenre: (g: string) => void;
}) {
  return (
    <div className="cmdbar-wrap">
      <div className="cmdbar glass">
        {/* search */}
        <label className="search-pill">
          <Search size={15} className="text-faint shrink-0" />
          <input
            type="text"
            placeholder="جستجوی فیلم، سریال، بازیگر…"
            aria-label="جستجو"
          />
          <span className="kbd">Ctrl K</span>
        </label>

        {/* genre pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1">
          {GENRE_CHIPS.map((g) => (
            <button
              key={g}
              className="pill-chip"
              data-on={genre === g ? "true" : undefined}
              onClick={() => onGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>

        {/* quality + notifications */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="q-badge">
            <MonitorPlay size={11} />
            4K · HDR10+
          </span>
          <button
            className="relative w-10 h-10 grid place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-mut hover:text-ink hover:bg-white/[0.08] transition-all"
            aria-label="اعلان‌ها"
          >
            <Bell size={16} />
            <span className="absolute top-2 left-2.5 w-[7px] h-[7px] rounded-full bg-rose shadow-[0_0_8px_rgba(255,77,157,0.9)]" />
          </button>
        </div>
      </div>
    </div>
  );
}
