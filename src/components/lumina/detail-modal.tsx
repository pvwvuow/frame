"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  Play, X, Plus, Download, Check, Star, Clock3, Clapperboard, ListVideo,
} from "lucide-react";
import type { Title } from "@/lib/titles";
import { toFa, initials } from "./detail-utils";

/* Detail sheet — glass modal with episodes */

export function DetailSheet({
  title,
  onClose,
  onPlay,
  inList,
  onToggleList,
}: {
  title: Title;
  onClose: () => void;
  onPlay: (t: Title) => void;
  inList: boolean;
  onToggleList: (t: Title) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <motion.div
        className="sheet-overlay"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28 }}
      />
      <motion.div
        className="fixed inset-0 z-[81] grid place-items-center p-6 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="sheet-card glass-deep pointer-events-auto scroll-lum"
          initial={{ y: 46, scale: 0.965, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 30, scale: 0.97, opacity: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 27 }}
          role="dialog"
          aria-modal="true"
          aria-label={title.fa}
        >
          {/* hero */}
          <div className="sheet-hero">
            <img src={title.backdrop ?? title.poster} alt="" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(8,8,16,0.98) 2%, rgba(8,8,16,0.35) 45%, transparent 70%)" }} aria-hidden />
            <button className="sheet-close" onClick={onClose} aria-label="بستن"><X size={16} /></button>
            <div className="absolute bottom-4 inset-x-7 z-[2] flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="badge-prism text-[8.5px]!">{title.kind === "series" ? "سریال" : "فیلم"} · {title.quality}</span>
                  {title.badge && <span className="badge-prism text-[8.5px]! border-rose/40! bg-rose/10! text-[#FFB1D0]!">{title.badge}</span>}
                </div>
                <h3 className="text-[26px] font-black leading-tight">{title.fa}</h3>
                <div className="osd text-[9px]! mt-1 tracking-[0.2em]!">{title.en}</div>
              </div>
              <button className="btn-prism px-6! py-3! text-[13px]! shrink-0" onClick={() => onPlay(title)}>
                <Play size={15} fill="currentColor" className="relative z-[2]" />
                <span className="relative z-[2]">پخش</span>
              </button>
            </div>
          </div>

          {/* body */}
          <div className="p-7 pt-5">
            <div className="flex gap-6">
              {/* mini poster */}
              <div className="w-[132px] shrink-0 hidden sm:block">
                <div className="prism-frame p-1.5! rounded-2xl!">
                  <img src={title.poster} alt={`پوستر ${title.fa}`} className="rounded-xl!" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="hero-meta"><Star size={11} className="text-amber-300" fill="currentColor" />{toFa(title.rating)}</span>
                  <span className="hero-meta"><Clock3 size={11} />{title.duration}</span>
                  <span className="hero-meta"><Clapperboard size={11} />{title.director}</span>
                  <span className="hero-meta border-aqua/30! text-aqua!">{title.quality} HDR</span>
                  {title.dub && <span className="hero-meta">دوبله</span>}
                  {title.sub && <span className="hero-meta">زیرنویس</span>}
                </div>

                <p className="text-[13px] leading-7 text-[#BDBACE] mb-4">{title.synopsis}</p>

                <div className="flex items-center gap-1.5 flex-wrap mb-4">
                  {title.genres.map((g) => (
                    <span key={g} className="cast-pill text-[10.5px]! text-[#CDCADF]!">{g}</span>
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    className={`btn-glass py-2.5! px-5! text-[12.5px]! ${inList ? "border-aqua/40! text-aqua!" : ""}`}
                    onClick={() => onToggleList(title)}
                  >
                    {inList ? <Check size={14} /> : <Plus size={14} />}
                    {inList ? "در لیست شما" : "افزودن به لیست"}
                  </button>
                  <button className="btn-glass py-2.5! px-5! text-[12.5px]!">
                    <Download size={14} />
                    دانلود {title.quality}
                  </button>
                </div>
              </div>
            </div>

            {/* episodes */}
            {title.episodes && (
              <div className="mt-6">
                <div className="flex items-center gap-2.5 mb-3">
                  <ListVideo size={16} className="text-iris2" />
                  <span className="text-[15px] font-extrabold">قسمت‌ها</span>
                  <span className="osd text-[8.5px]!">{toFa(title.episodes.length)} EPISODE</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {title.episodes.map((ep) => (
                    <div key={ep.num} className="ep-row group/ep cursor-pointer">
                      <span className="osd text-[11px]! tracking-normal! w-7 shrink-0" dir="ltr">{ep.num}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold truncate">{ep.title}</div>
                        <div className="text-[10.5px] text-faint mt-0.5">{ep.dur}</div>
                      </div>
                      <div className="w-[110px] shrink-0 progress h-[4px]!">
                        <div className="progress-fill" style={{ width: `${ep.progress}%` }} />
                      </div>
                      <span className="w-9 h-9 grid place-items-center rounded-full text-mut group-hover/ep:text-ink group-hover/ep:bg-white/8 transition-all shrink-0">
                        {ep.progress === 100 ? <Check size={15} className="text-aqua" /> : <Play size={14} fill="currentColor" />}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* cast */}
            <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="osd text-[9px]! mb-3">عوامل</div>
              <div className="flex items-center gap-2 flex-wrap">
                {title.cast.map((c) => (
                  <span key={c} className="cast-pill">
                    <span className="avatar w-[22px]! h-[22px]! rounded-lg! text-[9px]!">{initials(c)}</span>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
