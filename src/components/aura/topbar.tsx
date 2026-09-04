"use client";

import { Search, Command, BadgeCheck } from "lucide-react";
import { GENRE_CHIPS } from "@/lib/titles";

/* ---------- floating glass command bar ---------- */
export function TopBar({ chip, onChip }: { chip: string; onChip: (c: string) => void }) {
  return (
    <div className="pointer-events-none sticky top-0 z-30 bg-gradient-to-b from-abyss via-abyss/85 to-transparent px-6 pb-5 pt-4">
      <div className="glass lg-rim lg-spec pointer-events-auto flex items-center gap-3 rounded-full py-2 pe-3 ps-4">
        {/* search */}
        <label className="lg-search flex min-w-0 shrink items-center gap-2.5 px-4 py-2" dir="rtl">
          <Search size={15} className="shrink-0 text-hushc" />
          <input
            placeholder="جستجو در قاب…"
            className="w-40 bg-transparent text-[12.5px] text-inkc outline-none placeholder:text-hushc xl:w-52"
          />
          <span
            dir="ltr"
            className="hidden items-center gap-0.5 rounded-md border border-white/12 bg-white/[.05] px-1.5 py-0.5 font-mono text-[9px] text-hushc md:flex"
          >
            <Command size={9} /> K
          </span>
        </label>

        <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden />

        {/* genre chips */}
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto" dir="rtl">
          {GENRE_CHIPS.map((g) => (
            <button key={g} onClick={() => onChip(g)} data-on={chip === g} className="pill cursor-pointer">
              {g}
            </button>
          ))}
        </div>

        {/* quality badge */}
        <span
          dir="ltr"
          className="hidden shrink-0 items-center gap-1.5 rounded-full border border-aqua/30 bg-aqua/[.08] px-3 py-1.5 font-mono text-[9.5px] tracking-[0.18em] text-aqua xl:flex"
        >
          <BadgeCheck size={11} /> 4K · HDR
        </span>
      </div>
    </div>
  );
}
