"use client";

import { Play, Plus, ChevronLeft, Star, Clock3 } from "lucide-react";
import type { Title } from "@/lib/titles";
import { trackSheen } from "./atmosphere";

/* ---------- section header — liquid reel board ---------- */
export function RowHeader({
  reel, title, en, hint,
}: {
  reel: string;
  title: string;
  en: string;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-end gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9.5px] tracking-[0.3em] text-aqua/75">
          <span className="size-1.5 rounded-full bg-aqua shadow-[0_0_10px_rgba(109,232,255,0.9)]" aria-hidden />
          <span>{reel}</span>
          <span className="text-hushc/70">·</span>
          <span className="text-iris/75">{en}</span>
          <span className="inline-block h-px w-16 bg-gradient-to-l from-white/25 to-transparent" aria-hidden />
        </div>
        <h2 className="text-[20px] font-black text-inkc">{title}</h2>
      </div>
      {hint && (
        <button className="mb-1 ms-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/[.04] px-3.5 py-1.5 text-[11.5px] text-dimc backdrop-blur-md transition-all hover:border-aqua/40 hover:text-aqua">
          {hint}
          <ChevronLeft size={13} />
        </button>
      )}
    </div>
  );
}

/* ---------- poster card — glass frame + sheen + dual halo ---------- */
export function PosterCard({
  t, rank, onOpen, onToast,
}: {
  t: Title;
  rank?: number;
  onOpen: (t: Title) => void;
  onToast: (m: string) => void;
}) {
  return (
    <div className="group relative flex items-end">
      {rank !== undefined && (
        <span
          className="rank-g pointer-events-none absolute -top-6 -start-1 z-[7] select-none text-[58px] drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
          aria-hidden
        >
          {String(rank).padStart(2, "0")}
        </span>
      )}
      <article
        onClick={() => onOpen(t)}
        onMouseMove={trackSheen}
        className="halo lg-rim lg-sheen group/poster relative w-full min-w-0 cursor-pointer rounded-[24px] border border-white/10 bg-white/[.05] p-1.5 backdrop-blur-md"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onOpen(t)}
        aria-label={`${t.kind === "series" ? "سریال" : "فیلم"} ${t.fa}`}
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-[19px]">
          <img src={t.poster} alt={`پوستر ${t.fa}`} loading="lazy" className="poster-media absolute inset-0 size-full object-cover" />

          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />

          {t.badge && (
            <span className="absolute start-2.5 top-2.5 z-[4] rounded-full border border-iris/40 bg-iris/15 px-2 py-0.5 text-[9.5px] font-bold text-iris backdrop-blur-md">
              {t.badge}
            </span>
          )}
          <span dir="ltr" className="absolute end-2.5 top-2.5 z-[4] rounded-full border border-white/20 bg-black/45 px-2 py-0.5 font-mono text-[8.5px] tracking-wider text-white/85 backdrop-blur-md">
            {t.quality}
          </span>

          {/* hover: liquid actions */}
          <div className="absolute inset-0 z-[5] flex items-center justify-center gap-2.5 bg-gradient-to-t from-black/55 via-transparent to-black/15 opacity-0 backdrop-blur-[2px] transition-all duration-300 group-hover/poster:opacity-100">
            <button
              className="btn-liquid size-11 !p-0"
              aria-label={`پخش ${t.fa}`}
              onClick={(e) => { e.stopPropagation(); onOpen(t); }}
            >
              <Play size={16} className="fill-[#04101A]" />
            </button>
            <button
              className="btn-glass size-11 !p-0"
              aria-label={`افزودن ${t.fa} به لیست`}
              onClick={(e) => { e.stopPropagation(); onToast(`«${t.fa}» به لیست من اضافه شد`); }}
            >
              <Plus size={16} />
            </button>
          </div>

          {/* caption */}
          <div className="absolute inset-x-0 bottom-0 z-[4] p-3.5">
            <h3 className="truncate text-[13.5px] font-extrabold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">{t.fa}</h3>
            <div dir="ltr" className="mt-1 flex items-center gap-2 font-mono text-[9px] tracking-wider text-white/70">
              <span className="flex items-center gap-0.5 text-aqua">
                <Star size={9} className="fill-aqua" /> {t.rating}
              </span>
              <span className="text-white/40">·</span>
              <span>{t.year.toLocaleString("fa-IR", { useGrouping: false })}</span>
              <span className="text-white/40">·</span>
              <span className="truncate font-disp tracking-[0.14em]">{t.en}</span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

/* ---------- continue-watching card — glass screen + sprocket strip ---------- */
export function ContinueCard({ t, onOpen }: { t: Title; onOpen: (t: Title) => void }) {
  return (
    <article
      onClick={() => onOpen(t)}
      onMouseMove={trackSheen}
      className="halo lg-rim lg-sheen group/cw relative w-full min-w-0 cursor-pointer rounded-[24px] border border-white/10 bg-white/[.05] p-1.5 backdrop-blur-md"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(t)}
      aria-label={`ادامهٔ تماشای ${t.fa}`}
    >
      <div className="scanlines relative aspect-video overflow-hidden rounded-[19px]">
        <img src={t.backdrop} alt={`صحنه‌ای از ${t.fa}`} loading="lazy" className="poster-media absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

        <span className="absolute inset-0 z-[5] grid place-items-center opacity-0 transition-opacity duration-300 group-hover/cw:opacity-100">
          <span className="btn-liquid pulse-ring size-13 !p-0">
            <Play size={19} className="fill-[#04101A]" />
          </span>
        </span>

        <span className="absolute start-3 top-3 z-[4] flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] text-white/85 backdrop-blur-md">
          <Clock3 size={10} className="text-aqua" />
          {t.remaining}
        </span>

        {/* sprocket progress — glassy */}
        <div className="absolute inset-x-3.5 bottom-3.5 z-[5]">
          <div className="strip">
            <div className="strip-fill" style={{ width: `${t.progress}%` }} />
            <div className="strip-perf" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="truncate text-[13px] font-extrabold text-inkc">{t.fa}</h3>
        <span dir="ltr" className="shrink-0 font-mono text-[9px] tracking-wider text-hushc">
          {t.progress}% · {t.quality}
        </span>
      </div>
    </article>
  );
}

/* ---------- horizontal reel row ---------- */
export function Reel({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-5 overflow-x-auto px-1 pb-3 pt-2">
      {children}
    </div>
  );
}
