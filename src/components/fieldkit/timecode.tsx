"use client";

import { useEffect, useState } from "react";

/* running 24fps timecode — the "alive projector" detail */
export function useTimecode(run = true) {
  const [tc, setTc] = useState("01:00:00:00");
  useEffect(() => {
    if (!run) return;
    let f = 86400 * 24; // start at 01:00:00:00
    const id = setInterval(() => {
      f = (f + 1) % (24 * 3600 * 24);
      const fr = f % 24;
      const s = Math.floor(f / 24);
      const hh = String(Math.floor(s / 3600)).padStart(2, "0");
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      setTc(`${hh}:${mm}:${ss}:${String(fr).padStart(2, "0")}`);
    }, 1000 / 12);
    return () => clearInterval(id);
  }, [run]);
  return tc;
}

export function Timecode({ className = "", run = true }: { className?: string; run?: boolean }) {
  const tc = useTimecode(run);
  return (
    <span dir="ltr" className={`font-mono tabular-nums ${className}`}>
      TC&nbsp;{tc}
    </span>
  );
}
