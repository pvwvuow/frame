"use client";

import {
  Compass, Film, Tv, Radio, Bookmark, Download, History,
  Settings, HardDrive, BadgeCheck,
} from "lucide-react";

/* Floating glass dock — RTL, hugs the right edge */

const MAIN_NAV = [
  { icon: Compass, label: "کشف", on: true },
  { icon: Film, label: "فیلم‌ها" },
  { icon: Tv, label: "سریال‌ها" },
  { icon: Radio, label: "پخش زنده" },
];

const LIB_NAV = [
  { icon: Bookmark, label: "لیست من", count: "12" },
  { icon: Download, label: "دانلودها", count: "4" },
  { icon: History, label: "تاریخچهٔ تماشا" },
];

export function Dock() {
  return (
    <aside className="dock glass" aria-label="ناوبری اصلی">
      <nav className="flex flex-col gap-1">
        {MAIN_NAV.map((it) => (
          <button key={it.label} className="dock-item" data-on={it.on ? "true" : undefined}>
            <it.icon size={17} strokeWidth={2.1} />
            <span>{it.label}</span>
          </button>
        ))}
      </nav>

      <div className="dock-label">کتابخانهٔ من</div>
      <nav className="flex flex-col gap-1">
        {LIB_NAV.map((it) => (
          <button key={it.label} className="dock-item">
            <it.icon size={17} strokeWidth={2.1} />
            <span>{it.label}</span>
            {it.count && <span className="dock-count">{it.count}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {/* local cache meter */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-[11px] text-mut">
              <HardDrive size={12} className="text-aqua/80" />
              حافظهٔ محلی
            </span>
            <span className="osd text-[8.5px]!">45%</span>
          </div>
          <div className="meter"><div className="meter-fill" style={{ width: "45%" }} /></div>
          <div className="osd text-[8.5px]! mt-2 tracking-[0.08em]!" dir="ltr">57.6 GB / 128 GB</div>
        </div>

        {/* user */}
        <button className="dock-item py-2.5! items-center">
          <span className="avatar w-9 h-9 text-[13px]">آر</span>
          <span className="flex flex-col min-w-0">
            <span className="text-[12.5px] font-bold text-ink truncate">آرش رحیمی</span>
            <span className="flex items-center gap-1 text-[9.5px] text-aqua/90 font-medium">
              <BadgeCheck size={10} />
              اشتراک پریمیوم · 4K
            </span>
          </span>
        </button>
        <button className="dock-item py-2!">
          <Settings size={16} strokeWidth={2.1} />
          <span>تنظیمات</span>
        </button>

        <div className="osd text-[8px]! text-center tracking-[0.12em]! pt-1">
          LUMINA BUILD 2609 · ELECTRON
        </div>
      </div>
    </aside>
  );
}
