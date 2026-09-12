"use client";

import Link from "next/link";
import FavoritesGrid from "@/components/library/FavoritesGrid";
import LoadErrorCard from "@/components/LoadErrorCard";
import { HeartIcon, BookmarkIcon, StarIcon, FilmIcon, TvIcon } from "@/components/Icons";
import { getFavoriteRows } from "@/lib/mobile/userdata";
import { fa } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { useI18n } from "@/components/i18n/LocaleProvider";

export default function FavoritesPage() {
  const { t: tr } = useI18n();
  const { data: rows, error, retry } = useAsyncData(() => getFavoriteRows(), []);

  const movies = rows?.filter((r) => r.title.type === "movie").length ?? 0;
  const avg = rows && rows.length ? (rows.reduce((a, r) => a + r.title.rating, 0) / rows.length).toFixed(1) : "—";
  const backdrop = rows?.[0]?.title.backdrop;

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        {backdrop && (
          <>
            { }
            <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 blur-sm" />
            <div className="absolute inset-0 bg-gradient-to-b from-rose-950/40 via-ink/85 to-ink" />
          </>
        )}
        <div className="relative mx-auto max-w-[1600px] px-4 pb-8 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs font-bold text-rose-400">
                <HeartIcon width={16} height={16} filled /> {tr("favorites.tagline")}
              </p>
              <h1 className="text-4xl font-black text-white sm:text-5xl">{tr("user.favorites")}</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">{tr("favorites.sub")}</p>
              <Link href="/my-list" className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/10">
                <BookmarkIcon width={13} height={13} /> {tr("favorites.goToList")}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { icon: HeartIcon, v: fa(rows?.length ?? 0), k: tr("favorites.fav"), c: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
                { icon: FilmIcon, v: fa(movies), k: tr("common.movie"), c: "border-sky-400/25 bg-sky-500/10 text-sky-300" },
                { icon: TvIcon, v: fa((rows?.length ?? 0) - movies), k: tr("common.series"), c: "border-violet-400/25 bg-violet-500/10 text-violet-300" },
                { icon: StarIcon, v: fa(avg), k: tr("catalog.avgRating"), c: "border-amber-400/25 bg-amber-500/10 text-amber-300" },
              ].map((s) => (
                <span key={s.k} className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold backdrop-blur ${s.c}`}>
                  <s.icon width={15} height={15} />
                  <span className="text-white num">{s.v}</span>
                  <span className="font-medium opacity-80">{s.k}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        {error ? <LoadErrorCard onRetry={retry} /> : rows ? <FavoritesGrid rows={rows} /> : <GridSkeleton />}
      </div>
    </main>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 py-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="aspect-[2/3] w-full animate-pulse rounded-xl bg-white/5" />
      ))}
    </div>
  );
}
