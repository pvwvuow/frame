import Link from "next/link";
import Hero from "@/components/Hero";
import Row from "@/components/Row";
import TitleCard from "@/components/TitleCard";
import { PlayIcon } from "@/components/Icons";
import {
  getFeatured,
  getTrending,
  getNewest,
  getTopRated,
  getByType,
  getByGenre,
  getWatchlistIds,
  getContinueWatching,
  getProgressMap,
} from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { getFavoriteRows, getMyListRows } from "@/lib/library";
import { fa, formatClock, episodeLabel } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { titleNames } from "@/lib/title-name";
import TitleName from "@/components/TitleName";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { t: tr, locale } = await getT();
  const userKey = await getUserKey();
  const [featured, trending, newest, topRated, series, action, scifi, watchlistIds, continueItems] = await Promise.all([
    getFeatured(),
    getTrending(),
    getNewest(),
    getTopRated(),
    getByType("series", { limit: 24 }),
    getByGenre("هیجان‌انگیز"),
    getByGenre("علمی‌تخیلی"),
    getWatchlistIds(userKey),
    getContinueWatching(userKey),
  ]);
  const [favRows, listRows] = await Promise.all([getFavoriteRows(userKey), getMyListRows(userKey)]);
  const myQueue = listRows.filter((r) => r.status !== "watched").slice(0, 12);
  const progressMap = await getProgressMap(
    userKey,
    Array.from(new Set([...trending, ...newest, ...topRated, ...series].map((t) => t.id)))
  );

  return (
    <main className="pb-10">
      <Hero items={featured} watchlistIds={watchlistIds} />

      <div className="relative z-10 -mt-16 space-y-2">
        {continueItems.length > 0 && (
          <Row title={tr("home.continueTitle")} subtitle={tr("home.continueSub")}>
            {continueItems.map((c) => (
              <Link
                key={c.title.id}
                href={`/watch/${c.title.slug}${c.episodeId ? `?ep=${c.episodeId}` : ""}`}
                className="group relative w-[260px] shrink-0 snap-start sm:w-[320px]"
              >
                <div className="relative aspect-video overflow-hidden rounded-xl ring-1 ring-white/5 transition group-hover:ring-white/20">
                  { }
                  <img src={c.title.backdrop} alt={titleNames(c.title, locale).primary} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <div className="card-gradient absolute inset-0" />
                  <div className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-black">
                      <PlayIcon width={24} height={24} className="ms-1" />
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <TitleName t={c.title} layout="inline" primaryClass="text-sm font-bold text-white" secondaryClass="text-[11px] text-zinc-300" />
                    <p className="text-[11px] text-zinc-300">
                      {c.episodeId ? `${episodeLabel(c.season ?? 1, c.episodeNumber ?? 1)} · ${c.episodeName}` : `${formatClock(c.duration - c.position)} ${tr("common.remaining")}`}
                    </p>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                    <div className="h-full bg-brand" style={{ width: `${(c.position / c.duration) * 100}%` }} />
                  </div>
                </div>
              </Link>
            ))}
          </Row>
        )}

        <Row title={tr("home.trendingTitle")} subtitle={tr("home.trendingSub")} href="/movies?sort=trending">
          {trending.map((t, i) => (
            <div key={t.id} className="relative flex shrink-0 items-end snap-start">
              <span
                className="outline-num pointer-events-none -me-5 mb-2 select-none text-[88px] font-black leading-none text-transparent sm:text-[110px]"
              >
                {i + 1}
              </span>
              <TitleCard t={t} progress={progressMap.get(t.id)} />
            </div>
          ))}
        </Row>

        {myQueue.length > 0 && (
          <Row title={tr("home.queueTitle")} subtitle={tr("home.queueSub")} href="/my-list">
            {myQueue.map((r) => (
              <TitleCard key={r.title.id} t={r.title} progress={r.progress} />
            ))}
          </Row>
        )}

        {favRows.length > 0 && (
          <Row title={`${tr("home.favoritesTitle")} ❤`} subtitle={tr("home.favoritesSub")} href="/favorites">
            {favRows.slice(0, 12).map((r) => (
              <TitleCard key={r.title.id} t={r.title} />
            ))}
          </Row>
        )}

        <Row title={tr("home.newestTitle")} subtitle={tr("home.newestSub")} href="/movies?sort=newest">
          {newest.map((t) => (
            <TitleCard key={t.id} t={t} progress={progressMap.get(t.id)} />
          ))}
        </Row>

        <Row title={tr("home.seriesTitle")} subtitle={tr("home.seriesSub")} href="/series">
          {series.map((t) => (
            <TitleCard key={t.id} t={t} progress={progressMap.get(t.id)} size="lg" />
          ))}
        </Row>

        {/* promo banner */}
        {featured[1] && (
          <section className="mt-12 px-4 sm:px-8 lg:px-12">
            <div className="relative overflow-hidden rounded-3xl ring-1 ring-white/10">
              { }
              <img src={featured[1].backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className={`absolute inset-0 ${locale === "en" ? "bg-gradient-to-r" : "bg-gradient-to-l"} from-ink via-ink/80 to-ink/20`} />
              <div className="relative flex min-h-[300px] flex-col justify-center gap-4 p-8 sm:p-14 lg:max-w-2xl">
                <span className="w-fit rounded-md bg-brand px-2 py-1 text-xs font-bold text-white">{tr("hero.featured")}</span>
                <TitleName t={featured[1]} as="h3" primaryClass="text-3xl font-black text-white sm:text-4xl" secondaryClass="text-base text-zinc-300" />
                <p className="line-clamp-2 text-sm leading-7 text-zinc-300">{featured[1].description}</p>
                <div className="flex gap-3">
                  <Link href={`/watch/${featured[1].slug}`} className="flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-black hover:bg-zinc-200">
                    <PlayIcon width={18} height={18} /> {tr("common.play")}
                  </Link>
                  <Link href={`/title/${featured[1].slug}`} className="flex h-11 items-center rounded-full border border-white/20 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur hover:bg-white/20">
                    {tr("common.details")}
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        <Row title={tr("home.topRatedTitle")} subtitle={tr("home.topRatedSub")} href="/movies?sort=rating">
          {topRated.map((t) => (
            <TitleCard key={t.id} t={t} progress={progressMap.get(t.id)} />
          ))}
        </Row>

        <Row title={tr("home.thrillerTitle")} subtitle={tr("home.thrillerSub")} href="/movies?genre=هیجان‌انگیز">
          {action.map((t) => (
            <TitleCard key={t.id} t={t} />
          ))}
        </Row>

        <Row title={tr("home.scifiTitle")} subtitle={tr("home.scifiSub")} href="/movies?genre=علمی‌تخیلی">
          {scifi.map((t) => (
            <TitleCard key={t.id} t={t} />
          ))}
        </Row>
      </div>
    </main>
  );
}
