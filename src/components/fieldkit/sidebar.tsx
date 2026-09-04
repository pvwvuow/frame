"use client";

import {
  Home, Clapperboard, Tv, Bookmark, Download, Settings, Search, Aperture,
} from "lucide-react";

export const NAV = [
  { id: "home", label: "خانه", en: "HOME", icon: Home },
  { id: "films", label: "فیلم‌ها", en: "FILMS", icon: Clapperboard },
  { id: "series", label: "سریال‌ها", en: "SERIES", icon: Tv },
  { id: "list", label: "لیست من", en: "MY LIST", icon: Bookmark },
  { id: "downloads", label: "دانلودها", en: "QUEUE", icon: Download },
] as const;

export type NavId = (typeof NAV)[number]["id"];

export function Sidebar({ active, onPick }: { active: NavId; onPick: (id: NavId) => void }) {
  return (
    <aside className="relative z-30 flex w-[204px] shrink-0 flex-col border-e border-line bg-coal2/80">
      {/* brand block */}
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <span className="relative grid size-11 place-items-center rounded-md border border-line2 bg-panel">
          <Aperture size={22} className="text-burn" strokeWidth={1.5} />
          <span className="absolute inset-0 rounded-md shadow-[inset_0_1px_0_rgba(255,196,107,0.25)]" />
        </span>
        <span className="leading-tight">
          <span className="block text-[17px] font-black text-ink">قاب</span>
          <span className="block font-mono text-[8.5px] tracking-[0.28em] text-faint">CINEMA OS</span>
        </span>
      </div>

      {/* nav */}
      <nav className="flex flex-col gap-0.5 px-3" aria-label="ناوبری اصلی">
        {NAV.map((item, i) => {
          const Icon = item.icon;
          const on = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPick(item.id)}
              data-active={on}
              aria-current={on ? "page" : undefined}
              className={`nav-item group flex items-center gap-3 rounded-sm px-3 py-2.5 text-[13px] transition-colors ${
                on
                  ? "bg-gradient-to-l from-burn/12 to-transparent text-amber"
                  : "text-mut hover:bg-panel2/70 hover:text-ink"
              }`}
            >
              <Icon size={17} strokeWidth={on ? 2 : 1.6} className={on ? "text-burn" : "text-faint group-hover:text-mut"} />
              <span className="font-semibold">{item.label}</span>
              <span dir="ltr" className="ms-auto font-mono text-[8.5px] tracking-[0.2em] text-faint/80">
                {String(i + 1).padStart(2, "0")}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mx-5 my-4 border-t border-dashed border-line" />

      {/* fake playlists */}
      <div className="px-5">
        <p className="mb-2 font-mono text-[9px] tracking-[0.24em] text-faint">REELS · نوارهای من</p>
        <ul className="space-y-1.5 text-[12px] text-mut">
          <li className="flex items-center gap-2">
            <span className="size-1.5 rotate-45 bg-ember shadow-[0_0_6px_rgba(229,72,31,0.8)]" />
            تماشای گروهی آخر هفته
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rotate-45 bg-burn/80" />
            نوآرهای کلاسیک
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rotate-45 bg-amber/70" />
            بامزه‌های بچگی
          </li>
        </ul>
      </div>

      <div className="mt-auto">
        {/* search shortcut */}
        <button className="mx-3 mb-3 flex w-[calc(100%-24px)] items-center gap-2.5 rounded-sm border border-line bg-panel/60 px-3 py-2 text-[12px] text-faint transition-colors hover:border-line2 hover:text-mut">
          <Search size={14} />
          جست‌وجو…
          <kbd dir="ltr" className="ms-auto font-mono text-[9px] text-faint/70 border border-line rounded px-1">Ctrl K</kbd>
        </button>

        {/* settings + user */}
        <button className="nav-item flex w-full items-center gap-3 px-6 py-2.5 text-[12.5px] text-mut transition-colors hover:text-ink" data-active={false}>
          <Settings size={15} strokeWidth={1.6} className="text-faint" />
          تنظیمات
        </button>
        <div className="m-3 flex items-center gap-2.5 rounded-sm border border-line bg-panel/70 p-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-gradient-to-br from-burn to-ember text-[13px] font-black text-[#191006]">
            ن
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[12px] font-bold text-ink">کاربر مهمان</span>
            <span dir="ltr" className="block font-mono text-[8.5px] tracking-[0.18em] text-amber/80">PRO·PASS 4K</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
