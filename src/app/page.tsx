"use client";

import Link from "next/link";
import { watchHref, titleHref } from "@/lib/links";
import Hero from "@/components/Hero";
import Row from "@/components/Row";
import TitleCard from "@/components/TitleCard";
import LoadErrorCard from "@/components/LoadErrorCard";
import { PlayIcon } from "@/components/Icons";
import { useI18n } from "@/components/i18n/LocaleProvider";
import {
  getFeatured,
  getTrending,
  getNewest,
  getTopRated,
  getByType,
  getByGenre,
  type TitleView,
} from "@/lib/mobile/db";
import {
  getWatchlistIds,
  getContinueWatching,
  getProgressMap,
  getFavoriteRows,
  getMyListRows,
  type FavoriteRow,
  type ListRow,
  type ContinueItem,
} from "@/lib/mobile/userdata";
import { formatClock, episodeLabel } from "@/lib/format";
import { backdropSrc } from "@/lib/covers";
import TitleName from "@/components/TitleName";
import { useAsyncData } from "@/lib/use-async-data";
import { AmbientGhost, useFamousPosterPool, type GhostSlot } from "@/components/ambient";
import { useEffect, useState } from "react";

type HomeData = {
  featured: TitleView[];
  trending: TitleView[];
  newest: TitleView[];
  topRated: TitleView[];
  series: TitleView[];
  action: TitleView[];
  scifi: TitleView[];
  watchlistIds: number[];
  continueItems: ContinueItem[];
  favRows: FavoriteRow[];
  listRows: ListRow[];
};

/* ── Home ghost covers (v0.30.10) ─────────────────────────────────────
 * The SAME famous-cover ambient as the VIP page — OVAL 16/9 backdrops
 * (the user flipped back from posters to the cover form) — spread over
 * FOURTEEN slots across the whole viewport (پراکندگی بیشتر) and DARKER
 * (opacity 0.08–0.16) so it never competes with the content — the rows
 * and the hero scroll OVER the fixed layer. It only exists BELOW the
 * hero: a sentinel right after <Hero> gates it (scroll-past → fade in,
 * scroll back → fade out); the ghosts themselves never scroll — they
 * are fixed, the content glides over them. */
const HOME_GHOST_SLOTS: GhostSlot[] = [
  { left: "3%",  top: "6%",  w: 340, dur: 14, delay: -3,  o: 0.12, blur: 3, tilt: "-3deg" },
  { left: "78%", top: "4%",  w: 300, dur: 16, delay: -9,  o: 0.1,  blur: 4, tilt: "2deg" },
  { left: "40%", top: "10%", w: 260, dur: 18, delay: -14, o: 0.08, blur: 5, tilt: "3deg" },
  { left: "62%", top: "22%", w: 360, dur: 13, delay: -6,  o: 0.14, blur: 3, tilt: "-2deg" },
  { left: "12%", top: "30%", w: 380, dur: 15, delay: -11, o: 0.15, blur: 3, tilt: "4deg" },
  { left: "85%", top: "34%", w: 320, dur: 17, delay: -2,  o: 0.11, blur: 4, tilt: "-3deg" },
  { left: "34%", top: "42%", w: 280, dur: 19, delay: -8,  o: 0.09, blur: 5, tilt: "2deg" },
  { left: "55%", top: "52%", w: 370, dur: 14, delay: -13, o: 0.13, blur: 3, tilt: "-4deg" },
  { left: "5%",  top: "58%", w: 300, dur: 16, delay: -5,  o: 0.11, blur: 4, tilt: "3deg" },
  { left: "80%", top: "64%", w: 400, dur: 12, delay: -10, o: 0.16, blur: 3, tilt: "-2deg" },
  { left: "28%", top: "72%", w: 340, dur: 20, delay: -16, o: 0.1,  blur: 5, tilt: "2deg" },
  { left: "60%", top: "80%", w: 280, dur: 15, delay: -7,  o: 0.12, blur: 4, tilt: "-3deg" },
  { left: "10%", top: "86%", w: 370, dur: 18, delay: -12, o: 0.14, blur: 3, tilt: "3deg" },
  { left: "88%", top: "88%", w: 270, dur: 17, delay: -4,  o: 0.09, blur: 5, tilt: "-2deg" },
];

function HomeGhosts() {
  const covers = useFamousPosterPool(42, "backdrop");
  const [on, setOn] = useState(false);

  /* gate = the sentinel right after the hero: ghosts fade in once it
   * climbs above 70% of the viewport (i.e. the user has scrolled into
   * the rows), fade out again when the hero takes the screen back. */
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const gate = document.getElementById("home-ghost-gate");
        if (!gate) return;
        setOn(gate.getBoundingClientRect().top < window.innerHeight * 0.7);
      });
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (covers.length < HOME_GHOST_SLOTS.length) return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
      style={{ opacity: on ? 1 : 0, transition: "opacity 1100ms ease" }}
    >
      {HOME_GHOST_SLOTS.map((slot, i) => (
        <AmbientGhost
          key={i}
          slot={slot}
          covers={covers}
          startIndex={i * 3}
          advance={HOME_GHOST_SLOTS.length}
          maxWidth="36vw"
          shape="oval"
        />
      ))}
      {/* gently sink the layer edges into the ink so ghosts never cut hard
          against the viewport border (they sit BEHIND z-10 content) */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(130% 100% at 50% 42%, transparent 48%, rgba(7, 7, 11, 0.85) 100%)" }}
      />
    </div>
  );
}

export default function HomePage() {
  const { t: tr, locale } = useI18n();

  /* B-2/B-3: the whole home feed is one useAsyncData run — but a single row
   * failing (e.g. one mobile/db query) must NOT blank the page. Each promise
   * degrades to an empty fallback; only when EVERY catalog row fails does the
   * loader reject and the error card render. */
  const { data: d, error, retry } = useAsyncData<HomeData>(async () => {
    const settled = await Promise.allSettled([
      getFeatured(),
      getTrending(),
      getNewest(),
      getTopRated(),
      getByType("series", { limit: 24 }),
      getByGenre("هیجان‌انگیز"),
      getByGenre("علمی‌تخیلی"),
      getWatchlistIds(),
      getContinueWatching(),
    ]);
    const ok = <T,>(i: number, fb: T): T =>
      settled[i].status === "fulfilled" ? (settled[i] as PromiseFulfilledResult<T>).value : fb;
    const failed = settled.filter((s) => s.status === "rejected").length;
    if (failed === settled.length) {
      // nothing answered — surface a retry instead of an empty shell
      throw new Error("home feed unavailable");
    }
    const featured = ok(0, [] as TitleView[]);
    const trending = ok(1, [] as TitleView[]);
    const newest = ok(2, [] as TitleView[]);
    const topRated = ok(3, [] as TitleView[]);
    const series = ok(4, [] as TitleView[]);
    const action = ok(5, [] as TitleView[]);
    const scifi = ok(6, [] as TitleView[]);
    const watchlistIds = ok(7, [] as number[]);
    const continueItems = ok(8, [] as ContinueItem[]);

    // user rows + progress degrade to empty fallbacks — they only shape
    // optional shelves, so a failure here must not blank the page either
    const [favRows, listRows, progressMap] = await Promise.all([
      getFavoriteRows().catch(() => [] as FavoriteRow[]),
      getMyListRows().catch(() => [] as ListRow[]),
      getProgressMap(
        Array.from(new Set([...trending, ...newest, ...topRated, ...series].map((t) => t.id)))
      ).catch(() => new Map<number, { position: number; duration: number }>()),
    ]);
    window.__namaProgress = {
      ...window.__namaProgress,
      ...Object.fromEntries(Array.from(progressMap.entries()).map(([k, v]) => [String(k), v])),
    };
    return { featured, trending, newest, topRated, series, action, scifi, watchlistIds, continueItems, favRows, listRows };
  }, []);

  if (error) {
    return (
      <main className="pb-10">
        <div className="pt-40">
          <LoadErrorCard onRetry={retry} />
        </div>
      </main>
    );
  }

  if (!d) return <HomeSkeleton />;

  const { featured, trending, newest, topRated, series, action, scifi, watchlistIds, continueItems, favRows, listRows } = d;
  const myQueue = listRows.filter((r) => r.status !== "watched").slice(0, 12);
  const progressMap = new Map<number, { position: number; duration: number }>(
    Object.entries(window.__namaProgress ?? {}).map(([k, v]) => [Number(k), v])
  );

  return (
    /* isolate: the ghost layer is fixed -z-10 — WITHOUT a stacking context
     * on <main> it would paint below body’s opaque bg-ink (html owns a
     * background, so body’s never propagates to the canvas — the v0.30.6
     * paint-order lesson). Isolating keeps it above the body background,
     * below the page content. */
    <main className="isolate pb-10">
      <Hero items={featured} watchlistIds={watchlistIds} />

      {/* ghost gate: everything BELOW this point floats over the fixed
          famous-poster layer (see HomeGhosts) */}
      <div id="home-ghost-gate" aria-hidden className="relative h-px w-full" />

      <HomeGhosts />

      <div className="relative z-10 mt-6 space-y-2">
        {continueItems.length > 0 && (
          <Row title={tr("home.continueTitle")} subtitle={tr("home.continueSub")}>
            {continueItems.map((c) => (
              <Link
                key={c.title.id}
                href={watchHref(c.title.slug, c.episodeId)}
                className="group relative w-[260px] shrink-0 snap-start sm:w-[320px]"
              >
                <div className="relative aspect-video overflow-hidden rounded-xl ring-1 ring-white/5 transition group-hover:ring-white/20">
                  <img src={backdropSrc(c.title)} alt={c.title.title} loading="lazy" decoding="async" data-ph-title={c.title.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
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

        <Row title={tr("home.newestTitle")} subtitle={tr("home.newestSub")} href="/movies?sort=newest">
          {newest.map((t) => (
            <TitleCard key={t.id} t={t} progress={progressMap.get(t.id)} />
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

        <Row title={tr("home.seriesTitle")} subtitle={tr("home.seriesSub")} href="/series">
          {series.map((t) => (
            <TitleCard key={t.id} t={t} progress={progressMap.get(t.id)} size="lg" />
          ))}
        </Row>

        {/* promo banner — v0.30.9: matte-glass slab (the material of the
            details pill the user picked as the reference): the artwork sits
            BEHIND a real backdrop-blur layer with a subtle white tint, so
            the whole banner reads as one frosted surface — no more hard
            gradient-to-solid slab */}
        {featured[1] && (
          <section className="mt-12 px-4 sm:px-8 lg:px-12">
            <div className="relative overflow-hidden rounded-3xl shadow-[0_30px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/15">
              <img src={backdropSrc(featured[1])} alt="" loading="lazy" decoding="async" data-ph-title={featured[1]?.title ?? ""} className="absolute inset-0 h-full w-full scale-110 object-cover" />
              <div className="absolute inset-0 bg-white/[0.07] backdrop-blur-[30px] backdrop-saturate-150" />
              <div className={`absolute inset-0 ${locale === "en" ? "bg-gradient-to-r" : "bg-gradient-to-l"} from-ink/70 via-ink/30 to-transparent`} />
              <div className="relative flex min-h-[300px] flex-col justify-center gap-4 p-8 sm:p-14 lg:max-w-2xl">
                <span className="w-fit rounded-md bg-brand px-2 py-1 text-xs font-bold text-white">{tr("hero.featured")}</span>
                <TitleName t={featured[1]} as="h3" primaryClass="text-3xl font-black text-white sm:text-4xl" secondaryClass="text-base text-zinc-300" />
                <p className="line-clamp-2 text-sm leading-7 text-zinc-200">{featured[1].description}</p>
                <div className="flex gap-3">
                  <Link href={watchHref(featured[1].slug)} className="flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-black hover:bg-zinc-200">
                    <PlayIcon width={18} height={18} /> {tr("common.play")}
                  </Link>
                  <Link href={titleHref(featured[1].slug)} className="flex h-11 items-center rounded-full border border-white/25 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur hover:bg-white/20">
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

function HomeSkeleton() {
  return (
    <main className="pb-10">
      <div className="h-[82vh] min-h-[560px] w-full animate-pulse bg-gradient-to-t from-white/5 to-transparent" />
      <div className="relative z-10 -mt-16 space-y-6 px-4 sm:px-8 lg:px-12">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4 overflow-hidden">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="w-[170px] shrink-0">
                <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-white/5" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
