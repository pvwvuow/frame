"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, Volume2, Maximize, X, SkipBack, SkipForward, Subtitles, Settings2 } from "lucide-react";
import { faNum, type MediaItem } from "@/lib/nova-data";

export function PlayerOverlay({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  useEffect(() => {
    if (!playing || !item) return;
    const t = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 0.35));
    }, 500);
    return () => clearInterval(t);
  }, [playing, item]);

  const totalMin = item?.type === "series" ? 48 : 128;
  const cur = Math.round((progress / 100) * totalMin);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black"
          role="dialog"
          aria-label={`پخش ${item.title}`}
        >
          {/* "video" surface */}
          <div className="absolute inset-0">
            { }
            <img
              src={item.backdrop ?? item.poster}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className={`absolute inset-0 transition-opacity duration-700 ${playing ? "opacity-0" : "opacity-60"} bg-black`} />
          </div>

          {/* center play state */}
          <AnimatePresence>
            {!playing && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setPlaying(true)}
                className="lg-btn lg-btn-primary absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
                aria-label="ادامه پخش"
              >
                <Play size={30} fill="currentColor" className="ms-1" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* top bar */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-5">
            <div>
              <div className="text-sm font-bold">{item.title}</div>
              <div className="text-[11px] text-white/60">
                {item.type === "series" ? "فصل ۲ • قسمت ۶ — «نیمه‌شب»" : item.titleEn}
              </div>
            </div>
            <button onClick={onClose} className="lg-btn grid h-10 w-10 place-items-center rounded-xl" aria-label="بستن پخش">
              <X size={17} />
            </button>
          </div>

          {/* bottom glass controls */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-5">
            <div className="lg lg-strong mx-auto max-w-4xl rounded-3xl p-4">
              {/* seek bar */}
              <div
                className="group relative mb-4 h-2 w-full cursor-pointer rounded-full bg-white/15"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const rtl = r.right - e.clientX;
                  setProgress(Math.min(100, Math.max(0, (rtl / r.width) * 100)));
                }}
                role="slider"
                aria-label="نوار زمان"
                aria-valuenow={Math.round(progress)}
              >
                <div
                  className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-amber-300 to-orange-500"
                  style={{ width: `${progress}%` }}
                >
                  <div className="shimmer absolute inset-0 rounded-full" />
                </div>
                <span
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-transform group-hover:scale-125"
                  style={{ right: `calc(${progress}% - 7px)` }}
                />
              </div>

              <div className="flex items-center gap-3 text-white/85">
                <button onClick={() => setPlaying((p) => !p)} className="lg-btn grid h-11 w-11 place-items-center rounded-2xl" aria-label={playing ? "توقف" : "پخش"}>
                  {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>
                <button className="lg-btn hidden h-10 w-10 place-items-center rounded-xl sm:grid" aria-label="قبلی">
                  <SkipBack size={15} />
                </button>
                <button className="lg-btn hidden h-10 w-10 place-items-center rounded-xl sm:grid" aria-label="بعدی">
                  <SkipForward size={15} />
                </button>

                <div className="ms-1 text-[11.5px] tabular text-white/75">
                  {faNum(cur)} از {faNum(totalMin)} دقیقه
                </div>

                <div className="mx-auto flex items-center gap-2">
                  <span className="lg-pill rounded-full px-3 py-1 text-[10.5px] font-bold text-amber-300">1080p</span>
                  <span className="lg-pill hidden items-center gap-1 rounded-full px-3 py-1 text-[10.5px] text-muted-foreground sm:flex">
                    <Subtitles size={11} />
                    فارسی
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Volume2 size={16} className="text-white/70" />
                  <div className="hidden h-1.5 w-20 rounded-full bg-white/15 md:block">
                    <div className="h-full w-2/3 rounded-full bg-white/70" />
                  </div>
                </div>

                <button className="lg-btn hidden h-10 w-10 place-items-center rounded-xl sm:grid" aria-label="تنظیمات پخش">
                  <Settings2 size={15} />
                </button>
                <button className="lg-btn grid h-10 w-10 place-items-center rounded-xl" aria-label="تمام‌صفحه">
                  <Maximize size={15} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
