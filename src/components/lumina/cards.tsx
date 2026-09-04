"use client";

import { useRef, type ReactNode } from "react";
import {
  Play, ChevronRight, ChevronLeft, Layers, Tv,
  Sparkles, TrendingUp, Download, Check,
} from "lucide-react";
import type { Title } from "@/lib/titles";
import { toFa, pad2 } from "./utils";

/* ---------- row header ---------- */
export function RowHeader({
  icon,
  label,
  link = "دیدن همه",
}: {
  icon: ReactNode;
  label: string;
  link?: string;
}) {
  return (
    <div className="row-head">
      <h2 className="row-title">
        <span className="row-spark">{icon}</span>
        {label}
      </h2>
      <button className="row-link">
        {link}
        <ChevronLeft size={13} />
      </button>
    </div>
  );
}

/* ---------- horizontal reel with hover arrows (RTL aware) ---------- */
export function Reel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * 620, behavior: "smooth" });
  };
  return (
    <div className="relative group/reel">
      <div ref={ref} className="reel no-scrollbar">
        {children}
      </div>
      <button className="reel-btn right-1!" aria-label="قبلی" onClick={() => scroll(-1)}>
        <ChevronRight size={18} />
      </button>
      <button className="reel-btn left-1!" aria-label="بعدی" onClick={() => scroll(1)}>
        <ChevronLeft size={18} />
      </button>
    </div>
  );
}

/* ---------- ranked poster card (Trending) ---------- */
export function RankCard({
  t,
  rank,
  onOpen,
}: {
  t: Title;
  rank: number;
  onOpen: (t: Title) => void;
}) {
  return (
    <div className="group relative flex items-end cursor-pointer" onClick={() => onOpen(t)}>
      <span className="rank-num relative z-0">{pad2(rank)}</span>
      <div className="relative z-[1] -ms-9 w-[186px] prism-hover">
        <div className="pc-media rim">
          <img src={t.poster} alt={`پوستر ${t.fa}`} loading="lazy" />
          <span className="badge-float"><b>{t.quality}</b></span>
          <div className="pc-scrim" aria-hidden />
          <span className="orb-play">
            <Play size={20} fill="currentColor" className="ms-0.5" />
          </span>
          <div className="absolute bottom-3 inset-x-3.5 z-[2]">
            <div className="pc-title">{t.fa}</div>
            <div className="pc-sub">{t.en} · {toFa(t.year)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- poster card (Series / New) ---------- */
export function PosterCard({
  t,
  onOpen,
}: {
  t: Title;
  onOpen: (t: Title) => void;
}) {
  return (
    <div className="group relative w-[186px] cursor-pointer prism-hover" onClick={() => onOpen(t)}>
      <div className="pc-media rim">
        <img src={t.poster} alt={`پوستر ${t.fa}`} loading="lazy" />
        {t.badge && <span className="badge-float text-[#FFC7DD]! border-rose/30!">{t.badge}</span>}
        <div className="pc-scrim" aria-hidden />
        <span className="orb-play">
          <Play size={20} fill="currentColor" className="ms-0.5" />
        </span>
        <div className="absolute bottom-3 inset-x-3.5 z-[2]">
          <div className="pc-title">{t.fa}</div>
          <div className="pc-sub flex items-center gap-1.5">
            <span className="text-amber-300/90">★</span>
            <span>{toFa(t.rating)}</span>
            <span>·</span>
            <span>{t.genres[0]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- continue watching (16:9) ---------- */
export function ContinueCard({
  t,
  onPlay,
}: {
  t: Title;
  onPlay: (t: Title) => void;
}) {
  return (
    <div className="group relative w-[302px] cursor-pointer prism-hover" onClick={() => onPlay(t)}>
      <div className="cc rim">
        <img src={t.backdrop ?? t.poster} alt={t.fa} loading="lazy" />
        <div className="pc-scrim" aria-hidden />
        <span className="badge-float">{t.kind === "series" ? "سریال" : "فیلم"} · <b>{t.quality}</b></span>
        <span className="cc-remain absolute top-2.5 left-3 z-[2]">{t.remaining}</span>
        <span className="orb-play w-[50px]! h-[50px]!">
          <Play size={18} fill="currentColor" className="ms-0.5" />
        </span>
        <div className="absolute bottom-0 inset-x-0 z-[2] p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-bold text-white">{t.fa}</span>
            <span className="pc-sub mt-0!">{t.duration}</span>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${t.progress}%` }} />
            <div className="progress-dot" style={{ "--p": `${100 - (t.progress ?? 0)}%` } as React.CSSProperties} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- collection banner ---------- */
export function CollectionBanner({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="coll group cursor-pointer" onClick={onExplore}>
      <img src="/backdrops/thumb-aurora.png" alt="" loading="lazy" />
      <div className="coll-scrim" aria-hidden />
      <div className="relative z-[2] h-full flex items-center justify-between p-7 min-h-[172px]">
        <div>
          <div className="osd text-[9px]! mb-2.5 flex items-center gap-2">
            <Layers size={11} className="text-aqua" />
            COLLECTION
          </div>
          <div className="text-[23px] font-black mb-1.5">شب‌های نئون — نئو‌نوآرِ ایرانی</div>
          <p className="text-[12.5px] text-mut leading-6 max-w-[420px]">
            ۱۲ اثر منتخب برای شب‌های بی‌خوابی؛ از کارآگاه‌های بارانی تا تعقیب‌های روی بزرگراهِ نور.
          </p>
          <div className="flex items-center gap-2 mt-3.5">
            <span className="hero-meta text-[11px]!"><Tv size={11} />۱۲ عنوان</span>
            <span className="hero-meta text-[11px]!"><Sparkles size={11} />به‌روزرسانی هفتگی</span>
          </div>
        </div>
        <button
          className="btn-prism px-6! py-3! text-[13px]! shrink-0"
          onClick={(e) => { e.stopPropagation(); onExplore(); }}
        >
          <TrendingUp size={15} className="relative z-[2]" />
          <span className="relative z-[2]">کاوش مجموعه</span>
        </button>
      </div>
    </div>
  );
}

/* ---------- small "download" action used in the sheet footer ---------- */
export function DownloadPill({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`btn-glass py-2.5! px-5! text-[12.5px]! ${done ? "border-aqua/40! text-aqua!" : ""}`}>
      {done ? <Check size={14} /> : <Download size={14} />}
      {label}
    </span>
  );
}
