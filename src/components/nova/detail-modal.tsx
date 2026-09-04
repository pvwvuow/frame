"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Play, Download, Bookmark, Check, Star, Clock, Users, Clapperboard,
  HardDrive, FileVideo, Languages, ChevronDown,
} from "lucide-react";
import { faNum, type MediaItem } from "@/lib/nova-data";
import type { NovaState } from "@/app/page";

export function DetailModal({
  item,
  onClose,
  nova,
  inList,
}: {
  item: MediaItem | null;
  onClose: () => void;
  nova: NovaState;
  inList: boolean;
}) {
  const [quality, setQuality] = useState<string>("1080p");

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-md"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`جزئیات ${item.title}`}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="lg lg-strong relative max-h-[88vh] w-full max-w-3xl overflow-y-auto scroll-glass rounded-[28px]"
          >
            {/* backdrop header */}
            <div className="relative h-64 overflow-hidden rounded-t-[28px]">
              { }
              <img
                src={item.backdrop ?? item.poster}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#101018] via-[#101018]/30 to-transparent" />

              <button
                onClick={onClose}
                className="lg-btn absolute end-4 top-4 grid h-9 w-9 place-items-center rounded-xl"
                aria-label="بستن"
              >
                <X size={16} />
              </button>

              <div className="absolute bottom-4 start-6 flex items-end gap-4">
                { }
                <img
                  src={item.poster}
                  alt={`پوستر ${item.title}`}
                  className="hidden w-24 rounded-2xl border border-white/20 shadow-2xl sm:block"
                />
                <div className="pb-1">
                  <div className="mb-1.5 flex items-center gap-2 text-[10px]">
                    <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 font-bold text-amber-300">
                      {item.type === "movie" ? "فیلم سینمایی" : "سریال"}
                    </span>
                    <span className="rounded-full border border-white/20 bg-black/40 px-2 py-0.5 text-white/80">{item.ageRating}</span>
                  </div>
                  <h2 className="text-2xl font-black drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">{item.title}</h2>
                  <p className="text-[12px] text-white/60">{item.titleEn}</p>
                </div>
              </div>
            </div>

            {/* body */}
            <div className="space-y-6 p-6 pt-5">
              {/* meta chips */}
              <div className="flex flex-wrap items-center gap-2.5 text-[12px]">
                <span className="lg-pill flex items-center gap-1.5 rounded-full px-3 py-1.5 text-amber-300">
                  <Star size={13} fill="currentColor" />
                  <span className="tabular font-bold">{faNum(item.rating)}</span>
                  <span className="text-muted-foreground">/۱۰</span>
                </span>
                <span className="lg-pill flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted-foreground">
                  <Clock size={13} />
                  {item.duration}
                </span>
                <span className="lg-pill flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted-foreground tabular">
                  {faNum(item.year)}
                </span>
                {item.genres.map((g) => (
                  <span key={g} className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] text-white/70">
                    {g}
                  </span>
                ))}
              </div>

              <p className="text-[13.5px] leading-8 text-white/80">{item.description}</p>

              {/* people */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="lg-pill flex items-center gap-3 rounded-2xl p-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-400">
                    <Clapperboard size={17} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10.5px] text-muted-foreground">کارگردان</div>
                    <div className="truncate text-[12.5px] font-bold">{item.director}</div>
                  </div>
                </div>
                <div className="lg-pill flex items-center gap-3 rounded-2xl p-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-400/15 text-violet-300">
                    <Users size={17} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10.5px] text-muted-foreground">بازیگران</div>
                    <div className="truncate text-[12.5px] font-bold">{item.cast.join("، ")}</div>
                  </div>
                </div>
              </div>

              {/* download quality selector */}
              <div className="lg-pill space-y-3.5 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-bold">
                    <FileVideo size={15} className="text-amber-400" />
                    انتخاب کیفیت دانلود
                  </span>
                  <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                    <HardDrive size={12} />
                    فضای لازم: <b className="tabular text-white/80">{faNum(item.sizeGb[quality])} گیگابایت</b>
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.quality.map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={`lg-pill rounded-xl px-4 py-2.5 text-[12.5px] font-bold transition-all duration-300 ${
                        quality === q ? "lg-active text-amber-100" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {q}
                      <span className="ms-2 text-[10px] font-normal text-muted-foreground tabular">
                        {faNum(item.sizeGb[q])} GB
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    onClick={() => nova.playItem(item)}
                    className="lg-btn lg-btn-primary flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold"
                  >
                    <Play size={16} fill="currentColor" />
                    پخش آنلاین
                  </button>
                  <button
                    onClick={() => nova.addDownload(item, quality)}
                    className="lg-btn flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold"
                  >
                    <Download size={16} />
                    دانلود {quality}
                  </button>
                  <button
                    onClick={() => nova.addItem(item)}
                    className="lg-btn flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm"
                    aria-label={inList ? "حذف از لیست من" : "افزودن به لیست من"}
                  >
                    {inList ? (
                      <><Check size={16} className="text-emerald-400" />در لیست من</>
                    ) : (
                      <><Bookmark size={16} />لیست من</>
                    )}
                  </button>
                </div>
              </div>

              {/* subtitle & audio info */}
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5">
                  <Languages size={12} />
                  زیرنویس فارسی
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5">
                  <Languages size={12} />
                  دوبله فارسی
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5">
                  <ChevronDown size={12} />
                  نسخه‌های متعدد
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
