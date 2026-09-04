"use client";

import { useRef } from "react";
import { Play, Plus, ChevronLeft, ChevronRight, Star, Clock3 } from "lucide-react";
import type { Title } from "@/lib/titles";

/* ---------- section header — reel board style ---------- */
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
        <div className="mb-1.5 flex items-center gap-2.5 font-mono text-[9.5px] tracking-[0.3em] text-burn/90">
          <span className="inline-block size-1.5 rotate-45 bg-burn shadow-[0_0_8px_rgba(255,122,31,0.9)]" />
          <span>{reel}</span>
          <span className="text-faint/70">·</span>
          <span dir="ltr" className="text-amber/70">{en}</span>
          <span className="inline-block h-px w-14 bg-gradient-to-l from-line2 to-transparent" />
        </div>
        <h2 className="text-[19px] font-black text-ink">{title}</h2>
      </div>
      {hint && (
        <button className="mb-1 ms-auto flex shrink-0 items-center gap-1 text-[12px] text-faint transition-colors hover:text-amber">
          {hint}
          <ChevronLeft size={14} />
        </button>
      )}
    </div>
  );
}

/* ---------- poster card — halation hover + leak sweep ---------- */
export function PosterCard({
  t, rank, onOpen, onToast,
}: {
  t: Title;
  rank?: number;
  onOpen: (t: Title) => void;
  onToast: (m: string) => void;
}) {
  return (
    <div className="group flex items-end gap-1">
      {rank !== undefined && (
        <span className="rank-num select-none pb-3 text-[64px]" aria-hidden>
          {String(rank).padStart(2, "0")}
        </span>
      )}
      <article
        onClick={() => onOpen(t)}
        className="halation-hover sweep group/poster relative w-full min-w-0 cursor-pointer overflow-hidden rounded-md border border-line bg-panel shadow-[inset_0_1px_0_rgba(255,196,107,0.07)]"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onOpen(t)}
        aria-label={`${t.kind === "series" ? "سریال" : "فیلم"} ${t.fa}`}
      >
        <div className="relative aspect-[2/3] overflow-hidden">
          <img src={t.poster} alt={`پوستر ${t.fa}`} loading="lazy" className="poster-media absolute inset-0 size-full object-cover" />

          {/* bottom info gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

          {/* kind / season badge */}
          {t.badge && (
            <span className="absolute right-2.5 top-2.5 z-[4] rounded-sm border border-burn/50 bg-black/60 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-amber backdrop-blur-sm">
              {t.badge}
            </span>
          )}

          {/* quality tag */}
          <span dir="ltr" className="absolute left-2.5 top-2.5 z-[4] rounded-sm border border-line2 bg-black/55 px-1.5 py-px font-mono text-[8.5px] tracking-wider text-ink/85 backdrop-blur-sm">
            {t.quality}
          </span>

          {/* hover: quick actions + viewfinder */}
          <div className="absolute inset-0 z-[5] flex items-center justify-center gap-2.5 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100">
            <span className="vf vf-tl !size-3.5" />
            <span className="vf vf-tr !size-3.5" />
            <span className="vf vf-bl !size-3.5" />
            <span className="vf vf-br !size-3.5" />
            <button
              className="btn-burn size-11 !rounded-full !p-0"
              aria-label={`پخش ${t.fa}`}
              onClick={(e) => { e.stopPropagation(); onOpen(t); }}
            >
              <Play size={16} className="fill-[#191006]" />
            </button>
            <button
              className="btn-ghost size-11 !rounded-full !p-0 backdrop-blur-sm"
              aria-label={`افزودن ${t.fa} به لیست`}
              onClick={(e) => { e.stopPropagation(); onToast(`«${t.fa}» به لیست من اضافه شد`); }}
            >
              <Plus size={16} />
            </button>
          </div>

          {/* caption */}
          <div className="absolute inset-x-0 bottom-0 z-[4] p-3">
            <h3 className="truncate text-[13.5px] font-extrabold text-ink drop-shadow">{t.fa}</h3>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] tracking-wider text-mut/90" dir="ltr">
              <span className="flex items-center gap-0.5 text-amber/95">
                <Star size={9} className="fill-amber" /> {t.rating}
              </span>
              <span className="text-faint">·</span>
              <span>{t.year.toLocaleString("fa-IR", { useGrouping: false })}</span>
              <span className="text-faint">·</span>
              <span className="truncate">{t.en}</span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

/* ---------- continue-watching card — landscape + filmstrip ---------- */
export function ContinueCard({ t, onOpen }: { t: Title; onOpen: (t: Title) => void }) {
  return (
    <article
      onClick={() => onOpen(t)}
      className="halation-hover group/cw relative w-full min-w-0 cursor-pointer overflow-hidden rounded-md border border-line bg-panel shadow-[inset_0_1px_0_rgba(255,196,107,0.07)]"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(t)}
      aria-label={`ادامهٔ تماشای ${t.fa}`}
    >
      <div className="scanlines relative aspect-video overflow-hidden">
        <img src={t.backdrop} alt={`صحنه‌ای از ${t.fa}`} loading="lazy" className="poster-media absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/25" />

        {/* play glyph */}
        <span className="absolute inset-0 z-[5] grid place-items-center opacity-0 transition-opacity duration-300 group-hover/cw:opacity-100">
          <span className="btn-burn size-12 !rounded-full !p-0">
            <Play size={18} className="fill-[#191006]" />
          </span>
        </span>

        <span className="absolute right-2.5 top-2.5 z-[4] flex items-center gap-1.5 rounded-sm bg-black/55 px-2 py-0.5 font-mono text-[9px] tracking-wider text-ink/90 backdrop-blur-sm">
          <Clock3 size={10} className="text-burn" />
          {t.remaining}
        </span>

        {/* sprocket progress */}
        <div className="absolute inset-x-3 bottom-3 z-[5]">
          <div className="filmstrip">
            <div className="filmstrip-fill" style={{ width: `${t.progress}%` }} />
            <div className="filmstrip-perf" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <h3 className="truncate text-[13px] font-extrabold text-ink">{t.fa}</h3>
        <span dir="ltr" className="shrink-0 font-mono text-[9px] tracking-wider text-faint">
          {t.progress}% · {t.quality}
        </span>
      </div>
    </article>
  );
}

/* ---------- horizontal reel row — hover scroll arrows (RTL-aware) ---------- */
export function Reel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  /* RTL: content overflows to the left → next = scrollBy(-x) */
  const nudge = (dx: number) => ref.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <div className="group/reel relative">
      <div ref={ref} className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-2 pt-1">
        {children}
      </div>
      <button
        type="button"
        onClick={() => nudge(-640)}
        aria-label="بعدی"
        className="reel-btn end-1.5"
      >
        <ChevronLeft size={17} />
      </button>
      <button
        type="button"
        onClick={() => nudge(640)}
        aria-label="قبلی"
        className="reel-btn start-1.5"
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
}
