"use client";

import Link from "next/link";
import type { TitleView } from "@/lib/queries";
import { fa, formatDuration, typeLabel } from "@/lib/format";
import { InfoIcon, PlayIcon, StarIcon } from "./Icons";
import { useQuickView } from "./quickview/QuickViewProvider";

export default function TitleCard({
  t,
  progress,
  size = "md",
  rank,
}: {
  t: TitleView;
  progress?: { position: number; duration: number } | null;
  size?: "sm" | "md" | "lg";
  rank?: number;
}) {
  const { open } = useQuickView();
  const pct = progress && progress.duration > 0 ? Math.min(100, (progress.position / progress.duration) * 100) : 0;
  const w = size === "sm" ? "w-[130px] sm:w-[150px]" : size === "lg" ? "w-[190px] sm:w-[230px]" : "w-[150px] sm:w-[190px]";

  return (
    <div className={`group relative block shrink-0 ${w} snap-start`}>
      <button
        type="button"
        onClick={() => open(t)}
        aria-label={`جزئیات ${t.title}`}
        className="relative block w-full text-start focus:outline-none"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-700 ring-1 ring-white/5 transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.14)] group-focus-visible:ring-2 group-focus-visible:ring-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={t.poster}
            alt={t.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="card-gradient absolute inset-0 opacity-90 transition-opacity duration-300 group-hover:opacity-100" />

          {/* badges */}
          <div className="absolute start-2 top-2 flex gap-1">
            <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">{t.quality}</span>
            {rank != null && rank <= 3 && (
              <span className="rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-black text-white">TOP {fa(rank)}</span>
            )}
          </div>
          <div className="absolute end-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-amber-400 backdrop-blur">
            <StarIcon width={11} height={11} />
            {fa(t.rating)}
          </div>

          {/* hover overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur transition-transform group-hover:scale-110">
              <InfoIcon width={22} height={22} />
            </span>
            <span className="text-[11px] font-bold text-white/90">مشاهده جزئیات</span>
          </div>

          {/* caption */}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <p className="truncate text-sm font-bold text-white">{t.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-300">
              <span>{typeLabel(t.type)}</span>
              <span className="opacity-50">·</span>
              <span>{fa(t.year)}</span>
              <span className="opacity-50">·</span>
              <span className="truncate">{t.genres[0]}</span>
            </p>
            <p className="mt-1 hidden text-[10px] text-zinc-400 group-hover:block">
              {t.type === "movie" ? formatDuration(t.duration) : `هر قسمت ${formatDuration(t.duration)}`}
            </p>
          </div>

          {pct > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
              <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </button>

      {/* direct play button (outside the modal trigger) */}
      <Link
        href={`/watch/${t.slug}`}
        aria-label={`پخش ${t.title}`}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-[54px] end-2 grid h-9 w-9 translate-y-2 place-items-center rounded-full bg-white text-black opacity-0 shadow-lg transition-all duration-300 hover:scale-110 hover:bg-brand hover:text-white group-hover:translate-y-0 group-hover:opacity-100"
      >
        <PlayIcon width={16} height={16} className="ms-0.5" />
      </Link>
    </div>
  );
}
