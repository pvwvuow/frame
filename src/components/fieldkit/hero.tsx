"use client";

import { Play, Plus, Info, Star } from "lucide-react";
import { Corners } from "./atmosphere";
import { HERO } from "@/lib/titles";

export function Hero({ onOpen, onToast }: { onOpen: () => void; onToast: (m: string) => void }) {
  const t = HERO;
  return (
    <section className="scanlines relative h-[56vh] min-h-[430px] overflow-hidden border-b border-line" aria-label="فیلم منتخب">
      {/* backdrop */}
      <div className="flicker absolute inset-0">
        <img
          src={t.backdrop}
          alt={`پس‌زمینهٔ ${t.fa}`}
          className="size-full object-cover object-center"
        />
      </div>

      {/* cinematic gradients (RTL: text anchored to the right) */}
      <div className="absolute inset-0 bg-gradient-to-l from-coal via-coal/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-coal via-transparent to-coal/30" />
      <div className="godrays" />
      {/* film-burn edge on the inline end */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-40 mix-blend-screen"
        style={{
          background:
            "linear-gradient(270deg, rgba(255,122,31,0.20), rgba(229,72,31,0.08) 45%, transparent 75%)",
        }}
      />

      {/* viewfinder + OSD labels */}
      <Corners />
      <span className="absolute left-5 top-5 z-[5] flex items-center gap-2 rounded-sm border border-line/70 bg-black/45 px-2.5 py-1 font-mono text-[10px] tracking-[0.2em] text-ink/85 backdrop-blur-sm">
        <span className="rec-dot" /> REC
      </span>
      <span
        dir="ltr"
        className="absolute right-5 top-5 z-[5] rounded-sm border border-line/70 bg-black/45 px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] text-amber/90 backdrop-blur-sm"
      >
        A-CAM · {t.quality} · {t.stock.split("·")[1] ?? "2.39:1"}
      </span>

      {/* content */}
      <div className="absolute inset-x-0 bottom-0 z-[5] px-8 pb-8">
        <div className="max-w-[560px]">
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] tracking-[0.26em] text-amber/90">
            <span className="inline-block h-px w-8 bg-gradient-to-l from-burn to-transparent" />
            FEATURED REEL · اکران امشب
          </div>

          <h1 className="text-[44px] font-black leading-[1.06] text-ink drop-shadow-[0_2px_18px_rgba(0,0,0,0.7)]">
            {t.fa}
          </h1>
          <p dir="ltr" className="title-outline mt-1 text-right font-mono text-[15px] font-bold tracking-[0.34em]">
            {t.en}
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-mut">
            <span className="flex items-center gap-1 font-bold text-amber">
              <Star size={13} className="fill-amber text-amber" /> {t.rating.toLocaleString("fa-IR")}
            </span>
            <span className="text-faint">|</span>
            <span>{t.year.toLocaleString("fa-IR")}</span>
            {t.genres.map((g) => (
              <span key={g} className="chip !py-0.5">{g}</span>
            ))}
            <span className="text-faint">|</span>
            <span>{t.duration}</span>
            <span className="rounded-sm border border-line2 px-1.5 py-px font-mono text-[9.5px] text-amber/90" dir="ltr">
              {t.quality}
            </span>
          </div>

          <p className="mt-3.5 line-clamp-2 max-w-[520px] text-[13.5px] leading-7 text-mut/95">
            {t.synopsis}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn-burn h-11 px-6 text-[14px]" onClick={onOpen}>
              <Play size={17} className="fill-[#191006]" /> پخش فیلم
            </button>
            <button
              className="btn-ghost h-11 px-5 text-[13px]"
              onClick={() => onToast("«دشتِ اخگر» به لیست من اضافه شد")}
            >
              <Plus size={16} /> لیست من
            </button>
            <button className="btn-ghost h-11 px-5 text-[13px]" onClick={onOpen}>
              <Info size={16} /> جزئیات
            </button>
            <span dir="ltr" className="ms-1 hidden font-mono text-[9px] tracking-[0.22em] text-faint xl:block">
              SHOT ON {t.stock}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
