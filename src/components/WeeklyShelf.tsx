"use client";

/* =====================================================================================
 * v0.51.0 — THE WEEKLY SHOP SHELF (پیشنهاد این هفته) — REBUILT FROM THE USER'S MOCKUPS
 *
 * The user shipped five boards: a walnut shadow-box on a near-black wall (the
 * content board + its green-screen variants) and an oak one on a cream wall —
 * SIX framed posters standing inside the case, each under its own puck lamp.
 * v0.50.0 invented its own shelf instead of following those boards; this
 * version is measured off them:
 *   • poster ratio 1:1.30 (10/13) — the display screens of the mock, NOT 2:3
 *   • gap between frames ≈ 24% of a poster's width
 *   • side inner margin ≈ 4.6% of the case · top board zone ≈ 21% · floor ≈ 15%
 *   • puck lamps hang directly UNDER the top board, warm pools on the wood back
 *   • card copy exactly as the content board: ONE title line, white ★ rating,
 *     OUTLINED genre chip, year, and an OUTLINED circular play button
 *
 * Data — the WEEKLY DECK contract (unchanged, src/lib/weekly-deck.ts):
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
 * Visual — all materials are CSS (layered repeating gradients = the wood
 * grain), no image assets: the case costs ~0 bytes and never 404s. Card copy
 * sits inside .force-dark so it stays literal white over artwork in BOTH
 * themes, exactly like the mockup boards.
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
      <div className="mb-3.5 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-white sm:text-xl">{tr("home.weeklyTitle")}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{personalized ? tr("home.weeklySub") : tr("home.weeklyColdSub")}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-zinc-400">
          {tr("home.weeklyWeek")} {locale === "en" ? weekNum : fa(weekNum)}
        </span>
      </div>

      {/* THE SHOP CASE — the mockup's shadow-box. Three boards: the top board
          the lamps hang from, the recessed wood back the frames stand against,
          and the floor they stand on. Light theme swaps walnut → oak. */}
      <div className="shop-case">
        <div aria-hidden className="shop-top" />
        <div className="shop-back">
          <div className="shop-aisle no-scrollbar">
            {picks.map((t) => (
              <ShopSlot key={t.id} t={t} playLabel={tr("common.play")} />
            ))}
          </div>
        </div>
        <div aria-hidden className="shop-floor" />
      </div>
    </section>
  );
}

/* One framed poster standing in the case, with its own lamp above it. The
 * whole frame is a details link; the round button is a SEPARATE sibling link
 * to the player (never a nested <a>). Copy sits inside .force-dark so it
 * stays literal-white over artwork in BOTH themes — like the mockup boards. */
function ShopSlot({ t, playLabel }: { t: TitleView; playLabel: string }) {
  const { locale } = useI18n();
  return (
    <div className="shop-slot group">
      {/* the lamp's warm pool lighting the wood back behind this frame */}
      <span aria-hidden className="shop-pool" />
      {/* the cone of light falling from the lamp onto the frame's top */}
      <span aria-hidden className="shop-cone" />
      {/* the puck lamp hanging under the top board, above this frame */}
      <span aria-hidden className="shop-puck"><i /></span>

      <div className="shop-frame">
        <Link href={titleHref(t.slug)} className="force-dark relative block h-full w-full overflow-hidden rounded-[4px]">
          <img
            src={posterSrc(t)}
            alt={t.title}
            loading="lazy"
            decoding="async"
            data-ph-title={t.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-[7%] pb-[8.5%] pe-[26%]">
            {/* the mock's single title line — no companion name on the card */}
            <TitleName
              t={t}
              hideSecondary
              primaryClass="text-[clamp(11px,1.05vw,16px)] font-extrabold leading-tight text-white"
            />
            <div className="mt-[4%] flex items-center gap-[4%] text-[clamp(8px,0.62vw,10px)]">
              <span className="flex shrink-0 items-center gap-0.5 font-bold text-white">
                <StarIcon width="1em" height="1em" className="shrink-0" />
                {Number(t.rating || 0).toFixed(1)}
              </span>
              {t.genres?.[0] ? (
                <span className="min-w-0 truncate rounded-[4px] border border-white/45 px-[0.4em] py-px font-semibold leading-tight text-white">
                  {genreLabel(t.genres[0], locale)}
                </span>
              ) : null}
              <span className="shrink-0 font-semibold text-white/70">{t.year}</span>
            </div>
          </div>
        </Link>
        <Link
          href={watchHref(t.slug)}
          aria-label={playLabel}
          className="shop-play absolute bottom-[3.5%] end-[4.5%] z-10"
        >
          <PlayIcon width="45%" height="45%" className="translate-x-[6%]" />
        </Link>
      </div>

      {/* the frame's shadow pooling on the floor it stands on */}
      <span aria-hidden className="shop-foot" />
    </div>
  );
}
