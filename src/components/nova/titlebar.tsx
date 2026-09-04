"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X, Wifi, Volume2, BatteryFull, Download } from "lucide-react";
import { faNum } from "@/lib/nova-data";

export function TitleBar({
  activeDownloads,
  onOpenDownloads,
}: {
  activeDownloads: number;
  onOpenDownloads: () => void;
}) {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("fa-IR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="lg relative z-30 flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-0 select-none"
      style={{ borderRadius: 0 }}>
      {/* app identity (start side = right in RTL) */}
      <div className="flex h-full items-center gap-2.5 pe-4 ps-4">
        <div className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-amber-300 to-orange-600 text-[11px] font-black text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
          ن
        </div>
        <span className="text-[13px] font-bold tracking-tight">نواپلی</span>
        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-px text-[10px] text-muted-foreground">
          Electron Preview
        </span>
      </div>

      {/* center status */}
      <div className="flex h-full items-center gap-2">
        <button
          onClick={onOpenDownloads}
          className="lg-pill hidden items-center gap-1.5 rounded-full px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:flex"
        >
          <Download size={12} />
          <span className="tabular">{faNum(activeDownloads)}</span>
          <span>دانلود فعال</span>
        </button>
        <div className="lg-pill hidden items-center gap-2 rounded-full px-3 py-1 text-[11px] text-muted-foreground md:flex">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
          متصل
        </div>
      </div>

      {/* end side: system tray icons + clock + window controls (left in RTL) */}
      <div className="flex h-full items-stretch">
        <div className="hidden h-full items-center gap-3 px-3 text-muted-foreground lg:flex">
          <Wifi size={14} />
          <Volume2 size={14} />
          <BatteryFull size={15} />
          <span className="tabular text-[12px] text-foreground/80">{time}</span>
        </div>

        {/* Windows controls — positioned at the visual left corner (RTL) */}
        <div className="ms-auto flex h-full items-stretch" dir="ltr">
          <button className="win-btn" title="کمینه" aria-label="کمینه کردن پنجره">
            <Minus size={14} />
          </button>
          <button className="win-btn" title="بیشینه" aria-label="بیشینه کردن پنجره">
            <Square size={12} />
          </button>
          <button className="win-btn win-btn-close" title="بستن" aria-label="بستن پنجره">
            <X size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
