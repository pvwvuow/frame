"use client";

import { useRef } from "react";
import { Play, Download, Bookmark, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { faNum, type MediaItem, type WatchProgress } from "@/lib/nova-data";
import type { NovaState } from "@/app/page";

/* ================= Poster card ================= */
export function PosterCard({
  item,
  nova,
  progress,
  rank,
  width = "w-[164px]",
}: {
  item: MediaItem;
  nova: NovaState;
  progress?: WatchProgress;
  rank?: number;
  width?: string;
}) {
  const inList = nova.myList.includes(item.id);
  return (
    <div className={`group relative shrink-0 ${width}`}>
      <button
        onClick={() => nova.openItem(item)}
        className="relative block w-full overflow-hidden rounded-[20px] border border-white/10 shadow-[0_14px_36px_-12px_rgba(0,0,0,0.7)] transition-all duration-500 hover:-translate-y-1.5 hover:border-white/30 hover:shadow-[0_24px_54px_-14px_rgba(0,0,0,0.8),0_0_24px_-6px_rgba(245,158,11,0.25)] focus-visible:outline-2 focus-visible:outline-amber-400"
        aria-label={`جزئیات ${item.title}`}
      >
        <div className="relative aspect-[2/3] w-full bg-gradient-to-br from-white/10 to-white/5">
          { }
          <img
            src={item.poster}
            alt={`پوستر ${item.title}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.07]"
          />

          {/* badges */}
          <div className="absolute start-2 top-2 flex items-center gap-1">
            <span className="lg-pill flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-amber-300">
              <Star size={9} fill="currentColor" />
              <span className="tabular">{faNum(item.rating)}</span>
            </span>
          </div>
          <span className="absolute end-2 top-2 rounded-full border border-white/25 bg-black/50 px-1.5 py-0.5 text-[9px] font-black tracking-wide backdrop-blur-md">
            {item.quality[0]}
          </span>

          {/* hover overlay */}
          <div className="lg-card-hover absolute inset-0 flex flex-col items-center justify-center gap-3 opacity-0 transition-opacity duration-400 group-hover:opacity-100">
            <span
              onClick={(e) => {
                e.stopPropagation();
                nova.playItem(item);
              }}
              className="lg-btn lg-btn-primary grid h-12 w-12 cursor-pointer place-items-center rounded-full"
              role="button"
              aria-label={`پخش ${item.title}`}
            >
              <Play size={19} fill="currentColor" className="ms-0.5" />
            </span>
            <div className="flex gap-2">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  nova.openItem(item);
                }}
                className="lg-btn grid h-9 w-9 cursor-pointer place-items-center rounded-xl"
                role="button"
                aria-label={`دانلود ${item.title}`}
              >
                <Download size={14} />
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  nova.addItem(item);
                }}
                className="lg-btn grid h-9 w-9 cursor-pointer place-items-center rounded-xl"
                role="button"
                aria-label={inList ? "حذف از لیست" : "افزودن به لیست"}
              >
                <Bookmark size={14} className={inList ? "fill-amber-400 text-amber-400" : ""} />
              </span>
            </div>
            {progress && (
              <span className="text-[10px] text-white/75">{progress.remaining}</span>
            )}
          </div>

          {/* progress bar (continue watching) */}
          {progress && (
            <div className="absolute inset-x-3 bottom-2.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-black/60 backdrop-blur">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-amber-300 to-orange-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              {progress.episode && (
                <div className="mt-1.5 text-[10px] font-medium text-white/85">{progress.episode}</div>
              )}
            </div>
          )}
        </div>
      </button>

      {/* rank number */}
      {rank !== undefined && (
        <span className="pointer-events-none absolute -start-2 -top-3 text-[52px] font-black leading-none text-white/90 [text-shadow:0_4px_18px_rgba(0,0,0,0.9),0_0_28px_rgba(245,158,11,0.35)] tabular">
          {faNum(rank)}
        </span>
      )}

      {/* title */}
      <div className="px-1 pt-2.5">
        <div className="truncate text-[13px] font-bold text-white/90">{item.title}</div>
        <div className="mt-0.5 flex items-center justify-between text-[10.5px] text-muted-foreground">
          <span className="truncate">{item.genres.slice(0, 2).join(" • ")}</span>
          <span className="tabular shrink-0 ps-2">{faNum(item.year)}</span>
        </div>
      </div>
    </div>
  );
}

/* ================= Horizontal row ================= */
export function MediaRow({
  title,
  icon: Icon,
  items,
  nova,
  progress,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number; className?: string }>;
  items: MediaItem[];
  nova: NovaState;
  progress?: WatchProgress[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section aria-label={title}>
      <div className="mb-4 flex items-center gap-3">
        <div className="lg lg-pill grid h-9 w-9 place-items-center rounded-xl text-amber-400">
          <Icon size={16} strokeWidth={1.9} />
        </div>
        <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
        <div className="ms-auto flex gap-2">
          <button onClick={() => scroll(-1)} className="lg-btn grid h-8 w-8 place-items-center rounded-lg" aria-label={`اسکرول به راست ${title}`}>
            <ChevronRight size={15} />
          </button>
          <button onClick={() => scroll(1)} className="lg-btn grid h-8 w-8 place-items-center rounded-lg" aria-label={`اسکرول به چپ ${title}`}>
            <ChevronLeft size={15} />
          </button>
        </div>
      </div>

      <div
        ref={ref}
        className="no-scrollbar flex gap-4 overflow-x-auto pb-2 pt-1"
      >
        {items.map((item, i) => (
          <PosterCard
            key={`${item.id}-${i}`}
            item={item}
            nova={nova}
            progress={progress?.find((p) => p.id === item.id)}
          />
        ))}
      </div>
    </section>
  );
}

/* ================= Ranked row ================= */
export function RankedRow({ title, items, nova }: { title: string; items: MediaItem[]; nova: NovaState }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section aria-label={title}>
      <div className="mb-4 flex items-center gap-3">
        <div className="lg lg-pill grid h-9 w-9 place-items-center rounded-xl text-amber-400">
          <Star size={16} strokeWidth={1.9} />
        </div>
        <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
        <div className="ms-auto flex gap-2">
          <button onClick={() => scroll(-1)} className="lg-btn grid h-8 w-8 place-items-center rounded-lg" aria-label="اسکرول">
            <ChevronRight size={15} />
          </button>
          <button onClick={() => scroll(1)} className="lg-btn grid h-8 w-8 place-items-center rounded-lg" aria-label="اسکرول">
            <ChevronLeft size={15} />
          </button>
        </div>
      </div>
      <div ref={ref} className="no-scrollbar flex gap-6 overflow-x-auto px-1 pb-2 pt-1">
        {items.map((item, i) => (
          <PosterCard key={item.id} item={item} nova={nova} rank={i + 1} width="w-[188px]" />
        ))}
      </div>
    </section>
  );
}
