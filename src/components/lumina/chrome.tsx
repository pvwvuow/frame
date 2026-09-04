"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X, Triangle, Wifi } from "lucide-react";

/* Windows titlebar + live clock (Electron shell feel) */

function useClock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setNow(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function Titlebar() {
  const time = useClock();
  return (
    <div className="titlebar select-none" dir="ltr">
      {/* window controls — far left in this RTL app mirror */}
      <div className="flex items-center h-full order-last">
        <button className="win-btn" aria-label="کوچک‌سازی"><Minus size={14} /></button>
        <button className="win-btn" aria-label="بزرگ‌نمایی"><Square size={11} /></button>
        <button className="win-btn close" aria-label="بستن"><X size={15} /></button>
      </div>

      <div className="flex items-center gap-2.5" dir="rtl">
        <span className="logo-mark">
          <Triangle size={9} strokeWidth={3.2} className="rotate-[180deg] translate-y-[1px]" fill="currentColor" />
        </span>
        <span className="font-mono text-[11px] font-semibold tracking-[0.28em] text-ink" style={{ fontFamily: "var(--font-en)" }}>
          LUMINA
        </span>
        <span className="osd tracking-[0.1em]! border border-white/10 rounded-full px-2 py-[2px] text-[8.5px]!">
          CINEMA OS · v1.0
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-4 order-first" dir="ltr">
        <span className="osd flex items-center gap-1.5">
          <Wifi size={10} className="text-aqua/80" />
          <span className="text-aqua/80">42.8 MB/s</span>
        </span>
        <span className="hr w-6 rotate-90 bg-white/15!" />
        <span className="osd tabular-nums">{time || "00:00:00"}</span>
      </div>
    </div>
  );
}
