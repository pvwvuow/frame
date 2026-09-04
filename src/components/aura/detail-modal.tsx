"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Plus, X, Star, Clock3, Download, Languages, UserRound } from "lucide-react";
import type { Title } from "@/lib/titles";
import { trackSheen } from "./atmosphere";

/* ---------- liquid glass detail sheet ---------- */
export function DetailModal({
  t, onClose, onToast,
}: {
  t: Title | null;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <AnimatePresence>
      {t && (
        <motion.div
          className="fixed inset-0 z-[80] grid place-items-center bg-[#04060F]/70 p-6 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            onMouseMove={trackSheen}
            initial={{ opacity: 0, y: 44, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="glass-deep lg-rim lg-sheen relative max-h-[88vh] w-full max-w-4xl overflow-y-auto scroll-glass rounded-[30px]"
            role="dialog"
            aria-modal="true"
            aria-label={`جزئیات ${t.fa}`}
          >
            {/* backdrop strip */}
            <div className="relative h-52 overflow-hidden">
              {t.backdrop ? (
                <img src={t.backdrop} alt="" className="size-full object-cover" />
              ) : (
                <img src={t.poster} alt="" className="size-full object-cover object-top blur-[2px]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#070B17] via-[#070B17]/35 to-transparent" />
              <div className="godrays absolute inset-0" aria-hidden />

              <button
                onClick={onClose}
                className="btn-glass absolute end-4 top-4 size-10 cursor-pointer !p-0"
                aria-label="بستن"
              >
                <X size={17} />
              </button>

              <div className="absolute bottom-4 end-6 flex items-center gap-2">
                <span className="pill !border-transparent !bg-gradient-to-l !from-aqua !to-iris !font-extrabold !text-[#061021]">
                  {t.kind === "series" ? "سریال" : "فیلم"}
                </span>
                <span dir="ltr" className="font-mono text-[9.5px] tracking-[0.22em] text-white/60">
                  {t.stock}
                </span>
              </div>
            </div>

            {/* body */}
            <div className="relative -mt-20 flex items-start gap-6 px-6 pb-6 max-md:flex-col">
              {/* poster */}
              <div className="lg-rim w-44 shrink-0 overflow-hidden rounded-3xl border border-white/15 bg-white/[.05] p-1.5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.85)] max-md:mx-auto max-md:w-36">
                <img src={t.poster} alt={`پوستر ${t.fa}`} className="aspect-[2/3] w-full rounded-[18px] object-cover" />
              </div>

              {/* info */}
              <div className="min-w-0 flex-1 pt-20 max-md:pt-2">
                <h2 className="text-[26px] font-black text-inkc">{t.fa}</h2>
                <p dir="ltr" className="mt-0.5 font-disp text-[11px] font-semibold tracking-[0.3em] text-aura">{t.en}</p>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-dimc">
                  <span dir="ltr" className="flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 font-mono text-[10.5px] text-gold">
                    <Star size={10} className="fill-gold" /> {t.rating}
                  </span>
                  <span>{t.year.toLocaleString("fa-IR", { useGrouping: false })}</span>
                  <span className="size-1 rounded-full bg-hushc" aria-hidden />
                  <span className="flex items-center gap-1"><Clock3 size={12} className="text-hushc" />{t.duration}</span>
                  <span className="size-1 rounded-full bg-hushc" aria-hidden />
                  <span dir="ltr" className="font-mono text-[10px] text-aqua">{t.quality}</span>
                  <span className="size-1 rounded-full bg-hushc" aria-hidden />
                  <span className="flex items-center gap-1"><Languages size={12} className="text-hushc" />{t.dub ? "دوبله" : "زیرنویس"}</span>
                </div>

                <p className="mt-3.5 text-[13px] leading-7 text-dimc">{t.synopsis}</p>

                {/* cast droplets */}
                {t.cast.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {t.cast.map((c) => (
                      <span key={c} className="pill !cursor-default !py-1.5">
                        <UserRound size={11} className="me-1.5 inline text-aqua" />
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {/* actions */}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => onToast(`در حال پخش «${t.fa}»…`)}
                    className="btn-liquid h-11 cursor-pointer px-6 text-[13.5px]"
                  >
                    <Play size={16} className="fill-[#04101A]" />
                    {t.kind === "series" ? "پخش قسمت بعدی" : "پخش فیلم"}
                  </button>
                  <button
                    onClick={() => onToast(`«${t.fa}» به صف دانلود اضافه شد`)}
                    className="btn-glass h-11 cursor-pointer px-5 text-[13px]"
                  >
                    <Download size={15} className="text-aqua" />
                    دانلود
                  </button>
                  <button
                    onClick={() => onToast(`«${t.fa}» به لیست من اضافه شد`)}
                    className="btn-glass size-11 cursor-pointer !p-0"
                    aria-label="افزودن به لیست من"
                  >
                    <Plus size={17} />
                  </button>
                </div>

                {/* episodes — series only */}
                {t.episodes && (
                  <div className="mt-6">
                    <div className="mb-2.5 flex items-center gap-2.5 font-mono text-[9.5px] tracking-[0.28em] text-aqua/75">
                      <span className="size-1.5 rounded-full bg-aqua shadow-[0_0_10px_rgba(109,232,255,0.9)]" aria-hidden />
                      EPISODES
                    </div>
                    <div className="space-y-2">
                      {t.episodes.map((ep) => (
                        <div
                          key={ep.num}
                          className="ep-g flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3"
                        >
                          <span dir="ltr" className="font-disp text-[15px] font-bold text-iris/90">{ep.num}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-[12.5px] font-bold text-inkc">{ep.title}</span>
                              <span className="shrink-0 text-[10.5px] text-hushc">{ep.dur}</span>
                            </div>
                            <div className="mt-2">
                              <div className="strip !h-[5px]">
                                <div className="strip-fill" style={{ width: `${ep.progress}%` }} />
                                <div className="strip-perf" />
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => onToast(`قسمت ${Number(ep.num).toLocaleString("fa-IR", { useGrouping: false })} در حال پخش…`)}
                            className="btn-glass size-9 shrink-0 cursor-pointer !p-0"
                            aria-label={`پخش قسمت ${ep.title}`}
                          >
                            <Play size={13} className="fill-inkc" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
