"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Play, Plus, Download, Star, Clapperboard, User } from "lucide-react";
import type { Title } from "@/lib/titles";
import { Corners } from "./atmosphere";

export function DetailModal({
  t, onClose, onToast,
}: {
  t: Title | null;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  /* ESC to close + lock scroll */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <AnimatePresence>
      {t && (
        <motion.div
          className="fixed inset-0 z-[90] grid place-items-center p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {/* overlay */}
          <div className="absolute inset-0 bg-[#050302]/80 backdrop-blur-[7px]" onClick={onClose} aria-hidden />

          <motion.article
            role="dialog"
            aria-modal="true"
            aria-label={`جزئیات ${t.fa}`}
            className="lab-panel burn-edge relative z-10 max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-lg shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]"
            initial={{ y: 26, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 14, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* header — film frame */}
            <div className="scanlines relative h-56 overflow-hidden">
              <img
                src={t.backdrop ?? t.poster}
                alt=""
                className="flicker absolute inset-0 size-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-panel via-black/35 to-black/25" />
              <div className="godrays" />
              <Corners />
              <span dir="ltr" className="absolute left-4 top-4 rounded-sm border border-line/70 bg-black/45 px-2 py-0.5 font-mono text-[9px] tracking-[0.2em] text-amber/90">
                REEL·{t.id.toUpperCase().slice(0, 6)} · {t.stock}
              </span>
              <button
                className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-sm border border-line2 bg-black/55 text-mut backdrop-blur-sm transition-colors hover:border-burn hover:text-amber"
                onClick={onClose}
                aria-label="بستن"
              >
                <X size={15} />
              </button>

              <div className="absolute bottom-3.5 right-5 left-5">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-[26px] font-black text-ink drop-shadow">{t.fa}</h2>
                    <p dir="ltr" className="title-outline mt-0.5 text-right font-mono text-[11px] font-bold tracking-[0.3em]">
                      {t.en}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 rounded-sm border border-amber/40 bg-black/50 px-2 py-1 font-mono text-[10px] text-amber">
                    <Star size={10} className="fill-amber" /> {t.rating.toLocaleString("fa-IR")}
                  </span>
                </div>
              </div>
            </div>

            {/* sprocket divider — the film identity detail */}
            <div className="perf-edge shrink-0" aria-hidden />

            {/* body */}
            <div className="scroll-film max-h-[44vh] overflow-y-auto">
              <div className="grid gap-6 p-6 sm:grid-cols-[136px_1fr]">
                {/* poster thumb */}
                <div className="hidden sm:block">
                  <img
                    src={t.poster}
                    alt={`پوستر ${t.fa}`}
                    className="aspect-[2/3] w-full rounded-md border border-line object-cover"
                  />
                  <div className="mt-2 flex justify-center gap-1.5 font-mono text-[8px] tracking-wider text-faint">
                    <span className={t.dub ? "text-amber/90" : ""}>دوبله</span>
                    <span>·</span>
                    <span className={t.sub ? "text-amber/90" : ""}>زیرنویس</span>
                  </div>
                </div>

                <div className="min-w-0">
                  {/* meta line */}
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[11.5px] text-mut">
                    <span>{t.year.toLocaleString("fa-IR")}</span>
                    <span className="text-faint">·</span>
                    <span>{t.duration}</span>
                    <span className="rounded-sm border border-line2 px-1.5 py-px font-mono text-[9px] text-amber/90" dir="ltr">{t.quality}</span>
                    {t.genres.map((g) => <span key={g} className="chip !py-0.5">{g}</span>)}
                  </div>

                  <p className="text-[13.5px] leading-7 text-mut">{t.synopsis}</p>

                  {/* crew */}
                  {t.director && (
                    <div className="mt-4 space-y-1.5 text-[12px]">
                      <p className="flex items-center gap-2 text-mut">
                        <Clapperboard size={13} className="text-burn" />
                        کارگردان: <b className="font-bold text-ink">{t.director}</b>
                      </p>
                      {t.cast.length > 0 && (
                        <p className="flex items-start gap-2 text-mut">
                          <User size={13} className="mt-1 shrink-0 text-burn" />
                          بازیگران:
                          <span className="flex flex-wrap gap-1.5">
                            {t.cast.map((c) => (
                              <span key={c} className="rounded-sm border border-line bg-panel px-2 py-0.5 text-[11.5px] text-ink/90">{c}</span>
                            ))}
                          </span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* actions */}
                  <div className="mt-5 flex flex-wrap items-center gap-2.5">
                    <button className="btn-burn h-10 px-5 text-[13px]" onClick={() => onToast(`پخش «${t.fa}»…`)}>
                      <Play size={15} className="fill-[#191006]" /> پخش
                    </button>
                    <button className="btn-ghost h-10 px-4 text-[12.5px]" onClick={() => onToast(`«${t.fa}» به صف دانلود اضافه شد (۱۰۸۰p)`)}>
                      <Download size={15} /> دانلود
                    </button>
                    <button className="btn-ghost h-10 px-4 text-[12.5px]" onClick={() => onToast(`«${t.fa}» به لیست من اضافه شد`)}>
                      <Plus size={15} /> لیست من
                    </button>
                  </div>
                </div>
              </div>

              {/* episodes */}
              {t.episodes && (
                <div className="border-t border-line px-5 pb-5 pt-4">
                  <div className="mb-3 flex items-center gap-2 font-mono text-[9.5px] tracking-[0.28em] text-burn/90">
                    <span className="inline-block size-1.5 rotate-45 bg-burn" />
                    EPISODES · قسمت‌ها
                  </div>
                  <ul className="space-y-1.5">
                    {t.episodes.map((ep) => (
                      <li
                        key={ep.num}
                        className="ep-row flex cursor-pointer items-center gap-4 rounded-sm border border-line bg-coal/50 px-4 py-2.5"
                      >
                        <span dir="ltr" className="font-mono text-[13px] font-bold text-burn/90">{ep.num}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-bold text-ink">{ep.title}</span>
                          <span className="mt-1 block">
                            <span className="filmstrip block !h-1.5">
                              <span className="filmstrip-fill block" style={{ width: `${ep.progress}%` }} />
                              <span className="filmstrip-perf block" />
                            </span>
                          </span>
                        </span>
                        <span dir="ltr" className="shrink-0 font-mono text-[9.5px] tracking-wider text-faint">{ep.dur}</span>
                        <Play size={13} className="shrink-0 text-faint" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.article>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
