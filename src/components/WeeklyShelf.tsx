"use client";

/* =====================================================================================
 * v0.50.0 — THE WEEKLY SHELF (پیشنهاد این هفته)
 *
 * The user asked for a "weekly shop" among the home rows, modeled on the
 * theater slider's new deck architecture:
 *   «بیا اینارو هم یک جا اضافه کن بین اسلاید شو های پایین... مثل شاپ هفتگی
 *    ک پیشنهادی میاد به کاربر نشون بده.. مثلا این هفته 6 تا فیلمی ک متناسب
 *    با کاربره بیاد نمایش بده (مناسب با علاقه ها ..چیز هایی ک دیده)»
 * and shipped mockups: a WOODEN SHELF holding SIX framed posters, each lit
 * by its own spotlight, each card showing title + rating + genre + year +
 * a play button — in BOTH themes (dark walnut / bright oak).
 *
 * Data — the WEEKLY DECK contract (src/lib/weekly-deck.ts):
 *   • build time ships a ~36-title quality POOL (weekly.json, content-hashed,
 *     REPLACED wholesale at runtime — the hero-deck lesson, no merges);
 *   • ON DEVICE pickWeeklySix() scores the pool against this viewer's taste
 *     — favorites, list statuses, continue-watching → genre weights — and
 *     rotates deterministically by ISO week: same week ⇒ same six, next
 *     Monday ⇒ a fresh shop;
 *   • everything the user already has/has seen is EXCLUDED — the shop must
 *     offer something NEW («چیز هایی ک دیده» is the taste signal, not the
 *     catalog);
 *   • no taste data ⇒ cold start: quality + variety cut, still weekly.
 *
 * Visual — the mockup's materials, in CSS (no image assets): wood grain via
 * layered repeating gradients (.wood-shelf/.wood-ledge in globals.css), a
 * warm lamp + light cone per frame (.spotlight-*), black poster bezels,
 * white-on-poster copy held literal by the .force-dark var-reset so the
 * light theme keeps white card text on artwork (exactly like the day
 * mockup) while the header text above the shelf follows the theme.
 * ===================================================================================== */

import Link from "next/link";
import TitleName from "@/components/TitleName";
import { PlayIcon, StarIcon } from "@/components/Icons";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { getWeeklyPool, type TitleView } from "@/lib/mobile/db";
import { getFavoriteRows, getMyListRows, getContinueWatching } from "@/lib/mobile/userdata";
import { useAsyncData } from "@/lib/use-async-data";
import { posterSrc } from "@/lib/covers";
import { titleHref, watchHref } from "@/lib/links";
import { genreLabel } from "@/lib/genres";
import { fa } from "@/lib/format";
import { isoWeekKey, pickWeeklySix, WEEKLY_COUNT } from "@/lib/weekly-deck";

type ShelfData = {
  picks: TitleView[];
  weekKey: string;
  personalized: boolean;
};

export default function WeeklyShelf() {
  const { t: tr, locale } = useI18n();

  const { data } = useAsyncData<ShelfData>(async () => {
    const pool = await getWeeklyPool();
    if (pool.length < WEEKLY_COUNT) return { picks: [], weekKey: isoWeekKey(), personalized: false };

    /* the viewer's taste — gathered from their OWN shelves, all local reads,
     * each degrading to empty (a failing shelf must never blank the page) */
    const [favs, list, cont] = await Promise.all([
      getFavoriteRows().catch(() => []),
      getMyListRows().catch(() => []),
      getContinueWatching().catch(() => []),
    ]);
    const genreWeights: Record<string, number> = {};
    const exclude = new Set<string>();
    const bump = (genres: string[] | undefined, w: number) => {
      for (const g of genres ?? []) if (g) genreWeights[g] = (genreWeights[g] ?? 0) + w;
    };
    let signals = 0;
    for (const f of favs) {
      bump(f.title.genres, 3); // a favorite is the strongest taste signal
      exclude.add(f.title.slug);
      signals++;
    }
    for (const r of list) {
      bump(r.title.genres, r.status === "watching" ? 2.5 : r.status === "watched" ? 2 : 1.2);
      exclude.add(r.title.slug); // already on their radar — offer something new
      signals++;
    }
    for (const c of cont) {
      bump(c.title.genres, 2.2); // what they're watching right now
      exclude.add(c.title.slug);
      signals++;
    }

    const weekKey = isoWeekKey();
    const picks = pickWeeklySix(pool, { genreWeights, excludeSlugs: exclude, weekKey });
    return { picks, weekKey, personalized: signals > 0 };
  }, [], { cacheKey: "home:weekly:v1" });

  if (!data || data.picks.length < WEEKLY_COUNT) return null; // no pool / short pool → no shelf, never a broken one
  const { picks, weekKey, personalized } = data;
  const weekNum = Number(weekKey.slice(-2));

  return (
    <section className="relative mt-12 px-4 sm:px-8 lg:px-12">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-white sm:text-xl">{tr("home.weeklyTitle")}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{personalized ? tr("home.weeklySub") : tr("home.weeklyColdSub")}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-zinc-400">
          {tr("home.weeklyWeek")} {locale === "en" ? weekNum : fa(weekNum)}
        </span>
      </div>

      {/* the wooden case: recessed interior (inset shadows) + the six frames
          standing on the front ledge — the mockup's shelf, in CSS */}
      <div className="wood-shelf relative overflow-hidden rounded-2xl px-3 pt-9 sm:px-5">
        <div className="no-scrollbar flex snap-x snap-mandatory gap-3 sm:gap-4">
          {picks.map((t) => (
            <ShelfFrame key={t.id} t={t} playLabel={tr("common.play")} />
          ))}
        </div>
        {/* the front board the frames stand on */}
        <div className="wood-ledge relative -mx-3 h-4 sm:-mx-5">
          <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
        </div>
      </div>
    </section>
  );
}

/* One framed poster + its private spotlight. The whole frame is a details
 * link; the round button is a SEPARATE sibling link to the player (never a
 * nested <a>). Poster copy sits inside .force-dark so it stays literal-white
 * over artwork in BOTH themes — the day mockup keeps white card text too. */
function ShelfFrame({ t, playLabel }: { t: TitleView; playLabel: string }) {
  const { locale } = useI18n();
  return (
    <div className="group relative w-[47%] max-w-[210px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:flex-1">
      {/* lamp + cone — each frame owns its spotlight, so a scrolled aisle
          keeps the lamps aligned with their frames on phones too */}
      <div aria-hidden className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2">
        <span className="spotlight-lamp block h-1.5 w-1.5 rounded-full" />
      </div>
      <div aria-hidden className="spotlight-cone pointer-events-none absolute -top-6 left-1/2 z-0 h-[80px] w-[130%] -translate-x-1/2 opacity-80 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="frame-bezel relative rounded-lg transition-transform duration-300 group-hover:-translate-y-1">
        <Link href={titleHref(t.slug)} className="force-dark relative block overflow-hidden rounded-[5px]">
          <img
            src={posterSrc(t)}
            alt={t.title}
            loading="lazy"
            decoding="async"
            data-ph-title={t.title}
            className="aspect-[2/3] w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-2">
            <TitleName
              t={t}
              primaryClass="text-[12px] font-extrabold leading-tight text-white"
              secondaryClass="text-[10px] leading-tight text-zinc-300"
            />
            <div className="mt-1.5 flex items-center gap-1.5 pe-7">
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-400">
                <StarIcon width={10} height={10} />
                {Number(t.rating || 0).toFixed(1)}
              </span>
              {t.genres?.[0] ? (
                <span className="rounded bg-white/15 px-1 py-px text-[9px] font-bold text-white backdrop-blur-sm">
                  {genreLabel(t.genres[0], locale)}
                </span>
              ) : null}
              <span className="text-[10px] text-zinc-300">{t.year}</span>
            </div>
          </div>
        </Link>
        <Link
          href={watchHref(t.slug)}
          aria-label={playLabel}
          className="absolute bottom-2 end-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-white/95 text-black shadow transition group-hover:bg-brand group-hover:text-white"
        >
          <PlayIcon width={12} height={12} className="ms-px" />
        </Link>
      </div>

      {/* the frame's shadow pooling on the wood under it */}
      <div aria-hidden className="pointer-events-none absolute inset-x-1.5 bottom-0 h-2.5 rounded-full bg-black/50 blur-md" />
    </div>
  );
}
