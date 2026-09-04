"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Download, Plus, Star, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { faNum, type MediaItem } from "@/lib/nova-data";
import type { NovaState } from "@/app/page";

export function Hero({ items, nova }: { items: MediaItem[]; nova: NovaState }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const item = items[idx];

  const next = useCallback(() => setIdx((i) => (i + 1) % items.length), [items.length]);
  const prev = useCallback(() => setIdx((i) => (i - 1 + items.length) % items.length), [items.length]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, 8000);
    return () => clearInterval(t);
  }, [next, paused]);

  const inList = nova.myList.includes(item.id);

  return (
    <section
      className="relative h-[430px] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="فیلم ویژه"
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={item.id}
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="absolute inset-0"
        >
          { }
          <img
            src={item.backdrop ?? item.poster}
            alt={`پس‌زمینه ${item.title}`}
            className="h-full w-full object-cover"
          />
        </motion.div>
      </AnimatePresence>

      {/* cinematic gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#06060a] via-[#06060a]/35 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-l from-[#06060a]/85 via-transparent to-[#06060a]/25" />

      {/* content */}
      <div className="relative z-10 flex h-full flex-col justify-end gap-5 p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-xl space-y-4"
          >
            <div className="flex items-center gap-2 text-[11px] font-bold text-amber-300">
              <span className="lg-pill rounded-full px-3 py-1">ویژه امروز</span>
              <span className="rounded-full bg-black/40 px-3 py-1 backdrop-blur-md">
                {item.type === "movie" ? "فیلم سینمایی" : "سریال"}
              </span>
            </div>

            <h1 className="text-4xl font-black leading-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
              {item.title}
              <span className="ms-3 align-middle text-base font-medium text-white/50">{item.titleEn}</span>
            </h1>

            <div className="flex flex-wrap items-center gap-2.5 text-[12px] text-white/85">
              <span className="lg-pill flex items-center gap-1 rounded-full px-2.5 py-1 text-amber-300">
                <Star size={12} fill="currentColor" />
                <span className="tabular font-bold">{faNum(item.rating)}</span>
              </span>
              <span className="rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-md tabular">{faNum(item.year)}</span>
              <span className="rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-md">{item.duration}</span>
              {item.quality.map((q) => (
                <span key={q} className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-bold backdrop-blur-md">
                  {q}
                </span>
              ))}
              <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] text-white/70">{item.ageRating}</span>
            </div>

            <p className="max-w-lg text-[13.5px] leading-7 text-white/75 line-clamp-2">
              {item.description}
            </p>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => nova.playItem(item)}
                className="lg-btn lg-btn-primary flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold"
              >
                <Play size={17} fill="currentColor" />
                پخش
              </button>
              <button
                onClick={() => nova.openItem(item)}
                className="lg-btn flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium"
              >
                <Download size={16} />
                دانلود
              </button>
              <button
                onClick={() => nova.addItem(item)}
                className="lg-btn grid h-11 w-11 place-items-center rounded-2xl"
                title={inList ? "حذف از لیست من" : "افزودن به لیست من"}
                aria-label={inList ? "حذف از لیست من" : "افزودن به لیست من"}
              >
                {inList ? <Check size={17} className="text-emerald-400" /> : <Plus size={17} />}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* pager */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {items.map((it, i) => (
              <button
                key={it.id}
                onClick={() => setIdx(i)}
                aria-label={`نمایش ${it.title}`}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === idx ? "w-8 bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.7)]" : "w-3 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
          <div className="ms-auto flex gap-2">
            <button onClick={prev} className="lg-btn grid h-9 w-9 place-items-center rounded-xl" aria-label="قبلی">
              <ChevronRight size={16} />
            </button>
            <button onClick={next} className="lg-btn grid h-9 w-9 place-items-center rounded-xl" aria-label="بعدی">
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
