"use client";

import { Minus, Square, X, Aperture, Droplets } from "lucide-react";
import { Timecode } from "./timecode";

/* ---------- Electron title bar — Windows style ---------- */
export function TitleBar() {
  return (
    <div dir="ltr" className="relative z-40 flex h-10 shrink-0 items-center border-b border-line bg-coal2/95 select-none">
      {/* left: menus (visual only) */}
      <div dir="rtl" className="flex items-center gap-1 ps-3 text-[11.5px] text-mut">
        <span className="me-2 flex items-center gap-1.5">
          <Aperture size={15} className="text-burn" strokeWidth={1.75} />
          <b className="text-[13px] font-black text-ink">قاب</b>
          <span className="font-mono text-[9.5px] tracking-[0.18em] text-faint">GHAB · FIELD KIT</span>
        </span>
        <span className="cursor-default rounded px-2 py-0.5 hover:bg-panel2 hover:text-ink">فایل</span>
        <span className="cursor-default rounded px-2 py-0.5 hover:bg-panel2 hover:text-ink">کتابخانه</span>
        <span className="cursor-default rounded px-2 py-0.5 hover:bg-panel2 hover:text-ink">دانلود</span>
        <span className="cursor-default rounded px-2 py-0.5 hover:bg-panel2 hover:text-ink">نمایش</span>
        <span className="cursor-default rounded px-2 py-0.5 hover:bg-panel2 hover:text-ink">راهنما</span>
      </div>

      {/* center: running timecode (the living projector) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Timecode className="text-[10.5px] tracking-widest text-faint" />
      </div>

      {/* right: window controls */}
      <div className="ms-auto flex h-full">
        <button className="win-btn" aria-label="کوچک‌کردن"><Minus size={14} /></button>
        <button className="win-btn" aria-label="بزرگ‌کردن"><Square size={12} /></button>
        <button className="win-btn close" aria-label="بستن"><X size={15} /></button>
      </div>
    </div>
  );
}

/* ---------- bottom OSD status bar — camera deck style ---------- */
export function StatusBar({ playing, onSwitchSkin }: { playing: string; onSwitchSkin?: () => void }) {
  return (
    <div className="relative z-40 flex h-9 shrink-0 items-center gap-4 border-t border-line bg-coal2/95 px-4 font-mono text-[10px] tracking-wider text-faint">
      <span className="flex items-center gap-1.5 text-mut">
        <span className="rec-dot" />
        <span dir="ltr">REC</span>
      </span>
      <Timecode className="text-mut" run={false} />
      <span className="hidden truncate md:inline" dir="rtl" style={{ fontFamily: "var(--font-fa)" }}>
        در حال پخش: {playing}
      </span>
      <span className="ms-auto hidden items-center gap-3 lg:flex" dir="ltr">
        <span className="text-flare/80">SRV·ONLINE</span>
        <span>4K·HDR10+</span>
        <span>2.39:1</span>
        <span>24FPS</span>
        <span className="inline-block size-2 bg-burn shadow-[0_0_8px_rgba(255,122,31,0.9)]" />
        <span className="text-amber/80">GHAB v0.2</span>
      </span>
      {onSwitchSkin && (
        <button
          onClick={onSwitchSkin}
          dir="rtl"
          className="btn-ghost ms-3 flex h-6.5 shrink-0 items-center gap-1.5 !rounded-full !px-3 !text-[10px] font-bold"
          style={{ fontFamily: "var(--font-fa)" }}
          title="تغییر پوستهٔ طراحی"
        >
          <Droplets size={11} className="text-flare" />
          پوستهٔ Liquid
        </button>
      )}
    </div>
  );
}
