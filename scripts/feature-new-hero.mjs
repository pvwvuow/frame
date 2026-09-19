#!/usr/bin/env node
/* Auto-curate the home-hero slideshow (featured flag).
 *
 * The user asked for a SYSTEM, not a one-off pick: «از این به بعد اگه محتوای
 * جدیدی اضافه کردیم... خودش تشخیص بده چیا جدیدن و امتیاز خوبی دارن و بذاره تو
 * اسلایدشو اصلی بالا». So every content publish runs this script and the hero
 * re-curates itself.
 *
 * v0.46.0 — the user recut the show AGAIN:
 *   «تو اسلایدر میخام سریال های درحال پخش رو بزاری ن قدیمی های ک تازه اپدیت
 *    کردیم.. فیلم ها هم امتیاز دار های جدید»
 * The wave-based cut kept starring old shows that merely got (re)added
 * (Hunter x Hunter 2011, Mr Sunshine 2018…). The rules are now CONTENT-based,
 * not add-date based:
 *
 *   1. ONGOING series (درحال پخش): type=series, year >= currentYear-1,
 *      rating ≥ HERO_MIN_RATING (8.0), real tt poster+backdrop, ≥1 episode
 *      (the hero's Play button must work) — top HERO_SERIES_SLOTS (5)
 *      by rating → trendingScore;
 *   2. NEW high-rated movies (امتیازدارهای جدید): type=movie,
 *      year >= currentYear-2, same quality gates — top HERO_MOVIE_SLOTS (3);
 *   3. cross-fill: a thin pool hands its unfilled slots to the other one;
 *   4. top-up (only if the total is still < 5): the freshest add-wave
 *      regardless of year, so a small catalog still gets a full show;
 *   5. documentaries («مستند») are excluded completely (standing rule,
 *      v0.38.0);
 *   6. DEDUPED BY TT: the scan leaves duplicate rows sharing one IMDb id
 *      (Takopi ×2, Dune: Part Two ×3) — the show must never hold two slides.
 *      Matching is the tt inside the poster path;
 *   7. order the merged lineup by rating → trendingScore, take HERO_COUNT (8),
 *      un-feature everything else.
 *
 * Manual override: put IMDb tt-ids in HERO_TT below to pin an exact lineup
 * (matching is by the tt-id inside the poster path, robust to slug renames).
 *
 * Usage:
 *   node scripts/feature-new-hero.mjs                # auto-curate (writes)
 *   node scripts/feature-new-hero.mjs --dry-run      # show the picks only
 *   HERO_MIN_RATING=8.0 HERO_SERIES_SLOTS=5 node scripts/feature-new-hero.mjs
 *
 * Idempotent: safe to re-run, same data → same lineup.
 * Called automatically by scripts/publish-catalog.mjs on every content update.
 */
import { createRequire } from "node:module";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");

const ROOT = path.join(import.meta.dirname, "..");
const require2 = createRequire(import.meta.url);
const { PrismaClient } = require2(path.join(ROOT, "node_modules", "@prisma", "client"));

/* ---- knobs ------------------------------------------------------------ */
/* A-24 — env numbers are sanitized: a typo like HERO_COUNT=eight must not
 * produce `LIMIT NaN` (SQL syntax error) and kill the whole publish
 * pipeline; fall back to the documented defaults instead. */
const envNum = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const COUNT = envNum(process.env.HERO_COUNT, 8);
const MIN_RATING = envNum(process.env.HERO_MIN_RATING, 8.0);
const SERIES_SLOTS = envNum(process.env.HERO_SERIES_SLOTS, 5);
const MOVIE_SLOTS = envNum(process.env.HERO_MOVIE_SLOTS, 3);
const WAVE_WINDOW_H = envNum(process.env.HERO_WAVE_WINDOW_H, 72);

/* Manual pin (checked first). Empty = full auto. tt-ids only. */
const HERO_TT = [
  // e.g. "tt26471411", // وقتی زندگی به شما نارنگی می دهد
];

/* ---------------------------------------------------------------------- */

const db = new PrismaClient({
  datasources: { db: { url: "file:" + ROOT + "/db/custom.db" } },
});

const ttOf = (poster) => /^\/covers\/(tt\d+)\//.exec(poster || "")?.[1] ?? null;

async function pickManual() {
  const picked = [];
  for (const tt of HERO_TT) {
    const t = await db.title.findFirst({
      where: { poster: { startsWith: `/covers/${tt}/` } },
      select: { id: true, title: true, titleEn: true, year: true, rating: true, type: true },
    });
    if (!t) throw new Error(`HERO_TT: ${tt} not found in DB`);
    picked.push(t);
  }
  return picked;
}

async function pickAuto() {
  /* v0.46.0 — content-based floors (NOT add-date based): a 2011 classic that
   * merely got re-added is an OLD show and stays off the slider. "درحال پخش"
   * has no DB flag, so the series floor is the release year: this year and
   * last year only. Movies: the last ~2 years of releases (جدید). */
  const YEAR = new Date().getFullYear();
  const seriesFloor = YEAR - 1;
  const movieFloor = YEAR - 2;
  console.log(`rules: ongoing series year>=${seriesFloor} · new movies year>=${movieFloor} · min rating ${MIN_RATING}`);

  /* NOTE: Title.createdAt stays MIXED (numeric epochs + text) — raw SQL only
   * (P2023), same reason as before. Documentaries are matched on the JSON
   * genres string exactly like queries.ts's hasGenre. LIMIT 40 gives the
   * tt-dedupe room to skip duplicate rows. */
  const DOC = `AND genres NOT LIKE '%"مستند"%'`;
  const ART = `AND poster LIKE '/covers/tt%' AND backdrop LIKE '/covers/tt%'`;
  const sel = `id, title, titleEn, year, rating, type, poster`;
  const order = `ORDER BY rating DESC, trendingScore DESC LIMIT 40`;
  const PLAYABLE = `EXISTS (SELECT 1 FROM "Episode" WHERE "Episode"."titleId" = "Title"."id")`;

  // 1) ONGOING series (درحال پخش) — year floor keeps the slider current.
  const seriesRows = await db.$queryRawUnsafe(
    `SELECT ${sel} FROM "Title"
     WHERE type = 'series' AND year >= ? AND rating >= ?
     ${ART} ${DOC} AND ${PLAYABLE}
     ${order}`,
    seriesFloor, MIN_RATING,
  );

  // 2) NEW high-rated movies (امتیازدارهای جدید).
  const movieRows = await db.$queryRawUnsafe(
    `SELECT ${sel} FROM "Title"
     WHERE type = 'movie' AND year >= ? AND rating >= ?
     ${ART} ${DOC}
     ${order}`,
    movieFloor, MIN_RATING,
  );

  /* tt-dedupe — the scan leaves duplicate rows sharing one IMDb id (Takopi
   * ×2, Dune: Part Two ×3). One show = one slide, ever. First (highest-rated)
   * row per tt wins. */
  const usedTt = new Set();
  const takeDedup = (rows, n) => {
    const out = [];
    for (const t of rows) {
      if (out.length >= n) break;
      const tt = ttOf(t.poster);
      if (tt && usedTt.has(tt)) continue;
      if (tt) usedTt.add(tt);
      out.push(t);
    }
    return out;
  };

  let picks = takeDedup(seriesRows, SERIES_SLOTS);
  // cross-fill: a thin series pool hands its unfilled slots to the movies.
  const movieSlots = MOVIE_SLOTS + Math.max(0, SERIES_SLOTS - picks.length);
  if (movieSlots > 0) picks = [...picks, ...takeDedup(movieRows, movieSlots)];
  // still short → deeper into both pools (dedupe keeps it safe).
  if (picks.length < COUNT) picks = [...picks, ...takeDedup(seriesRows, COUNT - picks.length)];
  if (picks.length < COUNT) picks = [...picks, ...takeDedup(movieRows, COUNT - picks.length)];

  // 3) TOP-UP (small catalogs only): the freshest add-wave regardless of
  //    year — the pre-v0.46 wave picker — so the show never runs on fumes.
  if (picks.length < 5) {
    const maxRow = await db.$queryRawUnsafe(`SELECT MAX(createdAt) AS m FROM "Title"`);
    const anchor = maxRow?.[0]?.m;
    if (anchor) {
      const anchorMs = Date.parse(String(anchor).replace(" ", "T") + (String(anchor).includes("Z") ? "" : "Z"));
      if (!Number.isNaN(anchorMs)) {
        const floor = new Date(anchorMs - WAVE_WINDOW_H * 3600_000)
          .toISOString().slice(0, 19).replace("T", " ");
        const waveRows = await db.$queryRawUnsafe(
          `SELECT ${sel} FROM "Title"
           WHERE createdAt >= ? AND rating >= 8.5
           ${ART} ${DOC} AND (type != 'series' OR ${PLAYABLE})
           ${order}`,
          floor,
        );
        picks = [...picks, ...takeDedup(waveRows, 5 - picks.length)];
        console.log(`top-up: wave floor ${floor.slice(0, 10)} (+${picks.length} total so far)`);
      }
    }
  }

  return picks.map((t) => ({ ...t, rating: Number(t.rating) }));
}

async function main() {
  const picked = HERO_TT.length ? await pickManual() : await pickAuto();
  if (picked.length < COUNT) {
    console.warn(`  ! only ${picked.length}/${COUNT} candidates matched the hero rules — shipping a smaller lineup`);
  }

  console.log("hero lineup:");
  for (const t of picked) {
    console.log(`  ${t.rating.toFixed(1)} | ${t.year} | ${t.type === "series" ? "سریال" : "فیلم "} | ${t.title} / ${t.titleEn}`);
  }

  if (DRY_RUN) {
    console.log("dry-run: nothing written.");
    return;
  }

  const cleared = await db.title.updateMany({ where: { featured: true }, data: { featured: false } });
  for (const t of picked) {
    await db.title.update({ where: { id: t.id }, data: { featured: true } });
  }
  console.log(`featured ${picked.length} title(s), un-featured the rest (cleared ${cleared.count})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
