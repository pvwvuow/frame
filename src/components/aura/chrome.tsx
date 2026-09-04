"use client";

import { Droplets, Minus, Square, X, Clapperboard } from "lucide-react";
import { Timecode } from "@/components/fieldkit/timecode";

/* ---------- Electron title bar — liquid glass edition ---------- */
export function TitleBar() {
  return (
    <div
      dir="ltr"
      className="relative z-40 flex h-11 shrink-0 items-center border-b border-white/[.07] bg-white/[.03] select-none backdrop-blur-xl"
    >
      {/* left: brand + menus */}
      <div dir="rtl" className="flex items-center gap-1 ps-3 text-[11.5px] text-dimc">
        <span className="me-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-aqua via-[#6D9BFF] to-iris shadow-[0_4px_18px_-4px_rgba(109,180,255,0.7)]">
            <Droplets size={14} className="text-[#04101A]" strokeWidth={2.2} />
          </span>
          <b className="text-[13.5px] font-black text-inkc">قاب</b>
          <span dir="ltr" className="font-disp text-[9px] tracking-[0.28em] text-hushc">
            GHAB · LIQUID CINEMA
          </span>
        </span>
        {["فایل", "کتابخانه", "دانلودها", "نمایش", "راهنما"].map((m) => (
          <span key={m} className="cursor-default rounded-full px-2.5 py-1 transition-colors hover:bg-white/[.07] hover:text-inkc">
            {m}
          </span>
        ))}
      </div>

      {/* center: living timecode */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Timecode className="text-[10px] tracking-widest text-hushc" />
      </div>

      {/* right: window controls */}
      <div className="ms-auto flex h-full">
        <button className="win-btn-g" aria-label="کوچک‌کردن"><Minus size={14} /></button>
        <button className="win-btn-g" aria-label="بزرگ‌کردن"><Square size={12} /></button>
        <button className="win-btn-g close" aria-label="بستن"><X size={15} /></button>
      </div>
    </div>
  );
}

/* ---------- bottom OSD strip — glass dock style ---------- */
export function StatusBar({ playing, onSwitchSkin }: { playing: string; onSwitchSkin?: () => void }) {
  return (
    <div className="relative z-40 flex h-9 shrink-0 items-center gap-4 border-t border-white/[.07] bg-white/[.03] px-4 font-mono text-[10px] tracking-wider text-hushc backdrop-blur-xl">
      <span className="flex items-center gap-1.5 text-dimc">
        <span className="rec-dot" />
        <span dir="ltr">REC</span>
      </span>
      <Timecode className="text-dimc" run={false} />
      <span className="hidden truncate md:inline" dir="rtl" style={{ fontFamily: "var(--font-fa)" }}>
        در حال پخش: {playing}
      </span>
      <span className="ms-auto hidden items-center gap-3 lg:flex" dir="ltr">
        <span className="text-aqua/80">SRV·ONLINE</span>
        <span>4K·HDR10+</span>
        <span>2.39:1</span>
        <span>24FPS</span>
        <span className="inline-block size-2 rounded-full bg-aqua shadow-[0_0_10px_rgba(109,232,255,0.9)]" />
        <span className="text-iris/80">GHAB v0.3 LIQUID</span>
      </span>
      {onSwitchSkin && (
        <button
          onClick={onSwitchSkin}
          dir="rtl"
          className="btn-glass ms-3 flex h-6.5 shrink-0 cursor-pointer items-center gap-1.5 !rounded-full !px-3 !text-[10px] font-bold"
          style={{ fontFamily: "var(--font-fa)" }}
          title="تغییر پوستهٔ طراحی"
        >
          <Clapperboard size={11} className="text-gold" />
          پوستهٔ Field Kit
        </button>
      )}
    </div>
  );
}
