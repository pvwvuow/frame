"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat,
  Volume2, Maximize2, ChevronDown, PictureInPicture2,
} from "lucide-react";
import type { Title } from "@/lib/titles";
import { hms } from "./utils";

/* Floating glass now-playing bar */

export function PlayerBar({
  title,
  onClose,
}: {
  title: Title;
  onClose: () => void;
}) {
  const DUR = 7920; // demo: 2:12:00
  const [playing, setPlaying] = useState(true);
  const [sec, setSec] = useState(4320); // resume at 1:12:00

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setSec((s) => Math.min(s + 1, DUR)), 1000);
    return () => clearInterval(id);
  }, [playing]);

  const pct = Math.min(100, (sec / DUR) * 100);

  return (
    <motion.div
      className="player glass-deep"
      dir="rtl"
      initial={{ y: 110, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 110, opacity: 0 }}
      transition={{ type: "spring", stiffness: 210, damping: 26 }}
    >
      {/* thumb + info */}
      <div className="player-thumb">
        <img src={title.backdrop ?? title.poster} alt="" />
      </div>
      <div className="min-w-0 w-[172px]">
        <div className="text-[13px] font-bold truncate">{title.fa}</div>
        <div className="osd text-[8px]! mt-1 tracking-[0.1em]! truncate">
          {title.quality} · DOLBY ATMOS · {title.dub ? "DUB" : "SUB"}
        </div>
      </div>

      {/* controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button className="player-ctl" aria-label="تصادفی"><Shuffle size={15} /></button>
        <button className="player-ctl" aria-label="قبلی"><SkipBack size={17} fill="currentColor" /></button>
        <button
          className="player-play mx-1"
          aria-label={playing ? "توقف" : "پخش"}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ms-0.5" />}
        </button>
        <button className="player-ctl" aria-label="بعدی"><SkipForward size={17} fill="currentColor" /></button>
        <button className="player-ctl" aria-label="تکرار"><Repeat size={15} /></button>
      </div>

      {/* progress */}
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <span className="player-time">{hms(sec)}</span>
        <div className="progress flex-1">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
          <div className="progress-dot" style={{ "--p": `${100 - pct}%` } as React.CSSProperties} />
        </div>
        <span className="player-time">{hms(DUR)}</span>
      </div>

      {/* right side */}
      <div className="flex items-center gap-1 shrink-0">
        <Volume2 size={16} className="text-mut" />
        <div className="vol-bar"><div className="vol-fill" /></div>
        <span className="hr w-5 rotate-90 mx-1.5 bg-white/15!" />
        <button className="player-ctl" aria-label="تصویر در تصویر"><PictureInPicture2 size={15} /></button>
        <button className="player-ctl" aria-label="تمام‌صفحه"><Maximize2 size={15} /></button>
        <button className="player-ctl" aria-label="بستن پخش‌کننده" onClick={onClose}>
          <ChevronDown size={17} />
        </button>
      </div>
    </motion.div>
  );
}
