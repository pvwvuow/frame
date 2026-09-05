"use client";

import Link from "next/link";
import type { TitleView } from "@/lib/queries";
import { fa, formatDuration, typeLabel } from "@/lib/format";
import { InfoIcon, PlayIcon, StarIcon } from "./Icons";
import { useQuickView } from "./quickview/QuickViewProvider";
import FavoriteButton from "./FavoriteButton";
import WatchlistButton from "./WatchlistButton";
import { useLibrary } from "./library/LibraryProvider";
import { useI18n } from "./i18n/LocaleProvider";
import { titleNames } from "@/lib/title-name";
import TitleName from "./TitleName";

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
  const { isFavorite, inList } = useLibrary();
  const { t: tr, locale } = useI18n();
  const names = titleNames(t, locale);
  const fav = isFavorite(t.id);
  const saved = inList(t.id);
  const pct = progress && progress.duration > 0 ? Math.min(100, (progress.position / progress.duration) * 100) : 0;
  const w = size === "sm" ? "w-[130px] sm:w-[150px]" : size === "lg" ? "w-[190px] sm:w-[230px]" : "w-[150px] sm:w-[190px]";

  return (
    <div className={`group relative block shrink-0 ${w} snap-start`}>
      <button
        type="button"
        onClick={() => open(t)}
        aria-label={tr("card.details", { name: names.label })}
        className="relative block w-full text-start focus:outline-none"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-700 ring-1 ring-white/5 transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.14)] group-focus-visible:ring-2 group-focus-visible:ring-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={t.poster}
            alt={names.label}
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
          <div className="absolute end-2 top-2 flex items-center gap-1">
            {fav && (
              <span className="grid h-5 w-5 place-items-center rounded-md bg-rose-600 text-white shadow" aria-label={tr("common.inFavorites")}>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              </span>
            )}
            {saved && !fav && (
              <span className="grid h-5 w-5 place-items-center rounded-md bg-brand text-white shadow" aria-label={tr("common.inYourList")}>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5L20 7" /></svg>
              </span>
            )}
            <span className="flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-amber-400 backdrop-blur">
              <StarIcon width={11} height={11} />
              {t.rating > 0 ? fa(t.rating) : "—"}
            </span>
          </div>

          {/* hover overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur transition-transform group-hover:scale-110">
              <InfoIcon width={22} height={22} />
            </span>
            <span className="text-[11px] font-bold text-white/90">{tr("common.viewDetails")}</span>
          </div>

          {/* caption */}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <TitleName t={t} primaryClass="text-sm font-bold text-white" secondaryClass="text-[10px] leading-4 text-zinc-300" />
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-300">
              <span>{typeLabel(t.type)}</span>
              {t.year > 0 && (
                <>
                  <span className="opacity-50">·</span>
                  <span>{fa(t.year)}</span>
                </>
              )}
              {t.genres[0] && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="truncate">{t.genres[0]}</span>
                </>
              )}
            </p>
          </div>

          {pct > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
              <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </button>

      {/* quick actions: favorite + list (outside the modal trigger) */}
      <div className="absolute bottom-[76px] start-2 flex translate-y-2 items-center gap-1.5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <FavoriteButton titleId={t.id} name={names.primary} variant="mini" />
        <WatchlistButton titleId={t.id} name={names.primary} variant="mini" />
      </div>

      {/* direct play button (outside the modal trigger) */}
      <Link
        href={`/watch/${t.slug}`}
        aria-label={tr("card.play", { name: names.label })}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-[76px] end-2 grid h-9 w-9 translate-y-2 place-items-center rounded-full bg-white text-black opacity-0 shadow-lg transition-all duration-300 hover:scale-110 hover:bg-brand hover:text-white group-hover:translate-y-0 group-hover:opacity-100"
      >
        <PlayIcon width={16} height={16} className="ms-0.5" />
      </Link>
    </div>
  );
}
