"use client";

import { Search, Bell, SlidersHorizontal } from "lucide-react";

export function TopBar({
  chip, onChip,
}: {
  chip: string;
  onChip: (c: string) => void;
}) {
  return (
    <div className="topbar-fade relative z-30 flex items-center gap-4 border-b border-line/60 bg-coal/70 px-6 py-3 backdrop-blur-md">
      {/* search — camera OSD style */}
      <label className="osd-search flex h-10 max-w-[440px] flex-1 items-center gap-2.5 rounded-sm px-3.5">
        <Search size={15} className="shrink-0 text-faint" />
        <input
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
          placeholder="جست‌وجوی فیلم، سریال، بازیگر…"
          aria-label="جست‌وجو"
        />
        <span className="hidden shrink-0 font-mono text-[9px] tracking-[0.22em] text-faint/70 lg:block">
          SEARCH·REEL
        </span>
      </label>

      {/* genre chips */}
      <div className="hidden flex-wrap items-center gap-1.5 lg:flex">
        {["همه", "فیلم", "سریال", "علمی‌تخیلی", "جنایی", "فانتزی"].map((c) => (
          <button key={c} className="chip" data-on={chip === c} onClick={() => onChip(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="ms-auto flex items-center gap-2">
        <button className="chip flex items-center gap-1.5" aria-label="فیلترها">
          <SlidersHorizontal size={12} />
          <span className="hidden md:inline">فیلتر</span>
        </button>
        <button className="relative grid size-9 place-items-center rounded-sm border border-line text-mut transition-colors hover:border-line2 hover:text-ink" aria-label="اعلان‌ها">
          <Bell size={15} strokeWidth={1.7} />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-ember shadow-[0_0_6px_rgba(229,72,31,0.9)]" />
        </button>
      </div>
    </div>
  );
}
