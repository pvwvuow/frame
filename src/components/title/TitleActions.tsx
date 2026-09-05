"use client";

import { useEffect, useState } from "react";
import { CloseIcon, PlayIcon, ShareIcon, CheckIcon } from "../Icons";

/** Trailer lightbox + share button (client-only bits of the title page) */
export function TrailerButton({ src, poster, title }: { src: string; poster: string; title: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15">
          <PlayIcon width={12} height={12} className="ms-0.5" />
        </span>
        تریلر
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[95] grid place-items-center bg-black/90 p-4 backdrop-blur-sm animate-fade-up"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10">
            <video src={src} poster={poster} controls autoPlay playsInline className="aspect-video w-full" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4">
              <p className="text-sm font-bold text-white">تریلر · {title}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="بستن"
                className="grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/15 hover:bg-black"
              >
                <CloseIcon width={18} height={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* cancelled */
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-label="اشتراک‌گذاری"
      className={`grid h-12 w-12 place-items-center rounded-full border transition ${
        done ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400" : "border-white/30 bg-white/10 text-white hover:bg-white/20"
      }`}
      title={done ? "لینک کپی شد" : "اشتراک‌گذاری"}
    >
      {done ? <CheckIcon /> : <ShareIcon />}
    </button>
  );
}
