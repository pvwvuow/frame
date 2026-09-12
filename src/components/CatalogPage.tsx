"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import TitleCard from "@/components/TitleCard";
import CatalogFilters from "@/components/CatalogFilters";
import CatalogLoadMore from "@/components/CatalogLoadMore";
import { PlayIcon, StarIcon, InfoIcon, FilmIcon, TvIcon, EyeIcon } from "@/components/Icons";
import { GENRES, getCatalogPage, getCatalogStats, getYears, type TitleListItem } from "@/lib/mobile/db";
import { getProgressMap } from "@/lib/mobile/userdata";
import { fa, formatDuration, formatViews } from "@/lib/format";
import { genreLabel } from "@/lib/genres";
import { useI18n } from "./i18n/LocaleProvider";
import TitleName from "@/components/TitleName";
import { titleHref, watchHref } from "@/lib/mobile-links";

export type CatalogSearchParams = { genre?: string; sort?: string; year?: string; rating?: string };

/** first paint size — the rest streams in via /api/catalog (load-more) */
const PAGE_SIZE = 48;

type CatalogState = {
  items: TitleListItem[];
  total: number;
  stats: { count: number; avgRating: number; totalViews: number; top: TitleListItem | null };
  years: number[];
  progress: Map<number, { position: number; duration: number }>;
};

/* heading/blurb come from the dictionary (v0.30.10) — the server pages no
   longer hardcode Persian, so EN mode renders a fully-EN catalog. */
function CatalogPageInner({ type }: { type: "movie" | "series" }) {
  const { t: tr, locale } = useI18n();
  const sp = useSearchParams();
  const genre = sp.get("genre") ?? undefined;
  const sort = sp.get("sort") ?? "trending";
  const year = sp.get("year") ? Number(sp.get("year")) : undefined;
  const minRating = sp.get("rating") ? Number(sp.get("rating")) : undefined;
  const [st, setSt] = useState<CatalogState | null>(null);

  useEffect(() => {
    let alive = true;
    setSt(null);
    (async () => {
      const [{ items, total }, stats, years] = await Promise.all([
        getCatalogPage(type, { genre, sort, year, minRating }, 0, PAGE_SIZE),
        getCatalogStats(type),
        getYears(type),
      ]);
      const progress = await getProgressMap(items.map((t) => t.id));
      if (!alive) return;
      setSt({ items, total, stats, years, progress });
    })();
    return () => {
      alive = false;
    };
  }, [type, genre, sort, year, minRating]);

  if (!st) return <CatalogSkeleton />;

  const { items, total, stats, years, progress } = st;
  const spotlight = !genre && !year && !minRating ? stats.top : items[0] ?? null;
  const Icon = type === "movie" ? FilmIcon : TvIcon;
  const filters = { type, genre, sort, year, minRating };
  const heading = tr(type === "movie" ? "common.movies" : "common.seriesPlural");
  const blurb = tr(type === "movie" ? "catalog.moviesBlurb" : "catalog.seriesBlurb");
  const genreView = genre ? genreLabel(genre, locale) : "";

  return (
    <main className="pb-16">
      {/* ── header / spotlight ─────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {spotlight && (
          <>
            { }
            <img src={spotlight.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-l from-ink/95 via-ink/75 to-ink/40" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-ink/40" />
          </>
        )}
        <div className="relative mx-auto flex max-w-[1600px] flex-col gap-8 px-4 pb-10 pt-28 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12 lg:pt-36">
          <div className="max-w-2xl">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
              <Icon width={16} height={16} /> {tr("catalog.library")}
            </p>
            <h1 className="text-4xl font-black text-white sm:text-5xl">
              {heading}
              {genreView && <span className="text-brand"> · {genreView}</span>}
            </h1>
            <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">{blurb}</p>

            <div className="mt-6 flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-2xl font-black text-white">{fa(stats.count)}</p>
                <p className="text-xs text-zinc-400">{tr("catalog.titles")}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-2xl font-black text-white">
                  <StarIcon width={18} height={18} className="text-amber-400" /> {fa(stats.avgRating)}
                </p>
                <p className="text-xs text-zinc-400">{tr("catalog.avgRating")}</p>
              </div>
              <div>
                <p className="text-2xl font-black text-white">{formatViews(stats.totalViews)}</p>
                <p className="text-xs text-zinc-400">{tr("catalog.totalViews")}</p>
              </div>
            </div>
          </div>

          {spotlight && (
            /* v0.30.10 — the user circled this card in red («قرار بود طراحی این رو
               عوض کنی»): it now wears the SAME matte frosted material as the
               details pill he approved — artwork ghosting behind a real
               backdrop-blur layer, white tint, soft ring; zero solid slab. */
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl shadow-[0_30px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/15">
              { }
              <img src={spotlight.backdrop} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover" />
              <div className="absolute inset-0 bg-[#101016]/55 backdrop-blur-[30px] backdrop-saturate-150" />
              <div className="relative flex items-center gap-4 p-4">
                { }
                <img src={spotlight.poster} alt={spotlight.title} className="h-32 w-[86px] shrink-0 rounded-xl object-cover shadow-lg ring-1 ring-white/20" />
                <div className="min-w-0 flex-1">
                  <p className="w-fit rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-zinc-200 ring-1 ring-white/15">
                    {genre ? tr("catalog.bestInGenre", { genre: genreView }) : tr("catalog.todayPick")}
                  </p>
                  <TitleName t={spotlight} layout="inline" primaryClass="text-lg font-black text-white" secondaryClass="text-xs text-zinc-400" className="mt-1.5" />
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                    <span className="flex items-center gap-1 text-amber-400">
                      <StarIcon width={12} height={12} /> {fa(spotlight.rating)}
                    </span>
                    · {fa(spotlight.year)} · {formatDuration(spotlight.duration)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={watchHref(spotlight.slug)}
                      className="flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-extrabold text-black transition hover:bg-zinc-200"
                    >
                      <PlayIcon width={14} height={14} /> {tr("common.play")}
                    </Link>
                    <Link
                      href={titleHref(spotlight.slug)}
                      className="flex h-9 items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-4 text-xs font-bold text-white backdrop-blur transition hover:bg-white/25"
                    >
                      <InfoIcon width={14} height={14} /> {tr("common.details")}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        <Suspense>
          <CatalogFilters genres={GENRES} years={years} genre={genre} sort={sort} year={year} minRating={minRating} />
        </Suspense>

        <div className="mt-6 flex items-center justify-between text-xs text-zinc-500">
          <p>
            <span className="font-bold text-zinc-300">{fa(total)}</span> {tr("catalog.titles")}
            {genreView && <> {tr("catalog.inGenre")} <span className="text-zinc-300">{genreView}</span></>}
            {year && <> · {tr("common.year")} <span className="text-zinc-300">{fa(year)}</span></>}
            {minRating && <> · {tr("catalog.ratingPlus", { n: fa(minRating) })}</>}
          </p>
          <p className="flex items-center gap-1">
            <EyeIcon width={12} height={12} /> {tr("catalog.previewHint")}
          </p>
        </div>

        {total === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-white/10 p-16 text-center">
            <Icon width={40} height={40} className="mx-auto text-zinc-600" />
            <p className="mt-4 text-lg font-bold text-white">{tr("catalog.emptyTitle")}</p>
            <p className="mt-1 text-sm text-zinc-500">{tr("catalog.emptyHint")}</p>
            <Link
              href={type === "movie" ? "/movies" : "/series"}
              className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
            >
              {tr("catalog.showAll")}
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {items.map((t, i) => (
              <div key={t.id} className="[&>div]:w-full">
                <TitleCard t={t} progress={progress.get(t.id)} rank={sort === "trending" && !genre ? i + 1 : undefined} />
              </div>
            ))}
          </div>
        )}

        {total > items.length && (
          <CatalogLoadMore
            filters={filters}
            offset={items.length}
            total={total}
            rankStart={sort === "trending" && !genre ? items.length + 1 : undefined}
          />
        )}
      </div>
    </main>
  );
}

function CatalogSkeleton() {
  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-t from-white/5 to-transparent" />
        <div className="relative mx-auto max-w-[1600px] px-4 pb-10 pt-32 sm:px-8 lg:px-12">
          <div className="h-10 w-64 animate-pulse rounded-xl bg-white/10" />
          <div className="mt-4 h-4 w-96 max-w-full animate-pulse rounded bg-white/5" />
        </div>
      </section>
      <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-4 px-4 sm:grid-cols-3 sm:px-8 md:grid-cols-4 lg:grid-cols-5 lg:px-12 xl:grid-cols-6 2xl:grid-cols-7">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] w-full animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    </main>
  );
}

export default function CatalogPage(props: { type: "movie" | "series" }) {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <CatalogPageInner {...props} />
    </Suspense>
  );
}
