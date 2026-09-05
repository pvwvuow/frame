import Link from "next/link";
import { Suspense } from "react";
import TitleCard from "@/components/TitleCard";
import CatalogFilters from "@/components/CatalogFilters";
import { PlayIcon, StarIcon, InfoIcon, FilmIcon, TvIcon, EyeIcon } from "@/components/Icons";
import { GENRES, getByType, getProgressMap, getCatalogStats, getYears } from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { fa, formatDuration, formatViews } from "@/lib/format";

export type CatalogSearchParams = { genre?: string; sort?: string; year?: string; rating?: string };

export default async function CatalogPage({
  type,
  heading,
  blurb,
  searchParams,
}: {
  type: "movie" | "series";
  heading: string;
  blurb: string;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const sp = await searchParams;
  const { genre, sort = "trending" } = sp;
  const year = sp.year ? Number(sp.year) : undefined;
  const minRating = sp.rating ? Number(sp.rating) : undefined;
  const userKey = await getUserKey();
  const [items, stats, years] = await Promise.all([
    getByType(type, { genre, sort, year, minRating }),
    getCatalogStats(type),
    getYears(type),
  ]);
  const progress = await getProgressMap(
    userKey,
    items.map((t) => t.id)
  );
  const spotlight = !genre && !year && !minRating ? stats.top : items[0] ?? null;
  const Icon = type === "movie" ? FilmIcon : TvIcon;

  return (
    <main className="pb-16">
      {/* ── header / spotlight ─────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {spotlight && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spotlight.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-l from-ink/95 via-ink/75 to-ink/40" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-ink/40" />
          </>
        )}
        <div className="relative mx-auto flex max-w-[1600px] flex-col gap-8 px-4 pb-10 pt-28 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12 lg:pt-36">
          <div className="max-w-2xl">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
              <Icon width={16} height={16} /> کتابخانه نما
            </p>
            <h1 className="text-4xl font-black text-white sm:text-5xl">
              {heading}
              {genre && <span className="text-brand"> · {genre}</span>}
            </h1>
            <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">{blurb}</p>

            <div className="mt-6 flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-2xl font-black text-white">{fa(stats.count)}</p>
                <p className="text-xs text-zinc-400">عنوان</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-2xl font-black text-white">
                  <StarIcon width={18} height={18} className="text-amber-400" /> {fa(stats.avgRating)}
                </p>
                <p className="text-xs text-zinc-400">میانگین امتیاز</p>
              </div>
              <div>
                <p className="text-2xl font-black text-white">{formatViews(stats.totalViews)}</p>
                <p className="text-xs text-zinc-400">بازدید کل</p>
              </div>
            </div>
          </div>

          {spotlight && (
            <div className="glass flex w-full max-w-md items-center gap-4 rounded-3xl p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={spotlight.poster} alt={spotlight.title} className="h-32 w-[86px] shrink-0 rounded-xl object-cover shadow-lg" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-brand">{genre ? `برترین ${genre}` : "پیشنهاد امروز"}</p>
                <p className="mt-1 truncate text-lg font-black text-white">{spotlight.title}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                  <span className="flex items-center gap-1 text-amber-400">
                    <StarIcon width={12} height={12} /> {fa(spotlight.rating)}
                  </span>
                  · {fa(spotlight.year)} · {formatDuration(spotlight.duration)}
                </p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/watch/${spotlight.slug}`}
                    className="flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-extrabold text-black hover:bg-zinc-200"
                  >
                    <PlayIcon width={14} height={14} /> پخش
                  </Link>
                  <Link
                    href={`/title/${spotlight.slug}`}
                    className="flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 text-xs font-bold text-white hover:bg-white/20"
                  >
                    <InfoIcon width={14} height={14} /> جزئیات
                  </Link>
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
            <span className="font-bold text-zinc-300">{fa(items.length)}</span> عنوان
            {genre && <> در ژانر <span className="text-zinc-300">{genre}</span></>}
            {year && <> · سال <span className="text-zinc-300">{fa(year)}</span></>}
            {minRating && <> · امتیاز {fa(minRating)}+</>}
          </p>
          <p className="flex items-center gap-1">
            <EyeIcon width={12} height={12} /> برای پیش‌نمایش روی هر پوستر کلیک کنید
          </p>
        </div>

        {items.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-white/10 p-16 text-center">
            <Icon width={40} height={40} className="mx-auto text-zinc-600" />
            <p className="mt-4 text-lg font-bold text-white">عنوانی با این فیلترها پیدا نشد</p>
            <p className="mt-1 text-sm text-zinc-500">فیلترها را تغییر دهید یا همه را حذف کنید.</p>
            <Link
              href={type === "movie" ? "/movies" : "/series"}
              className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
            >
              نمایش همه
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
      </div>
    </main>
  );
}
