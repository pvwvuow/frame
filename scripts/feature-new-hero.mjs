#!/usr/bin/env node
/* Auto-curate the home-hero slideshow (featured flag).
 *
 * The user asked for a SYSTEM, not a one-off pick: «از این به بعد اگه محتوای
 * جدیدی اضافه کردیم... خودش تشخیص بده چیا جدیدن و امتیاز خوبی دارن و بذاره تو
 * اسلایدشو اصلی بالا». So every content publish runs this script and the hero
 * re-curates itself from the freshest arrivals:
 *
 *   1. detect the newest add-wave in the DB (max createdAt);
 *   2. candidates = titles added within the wave window (default 72h, so
 *      syncs that spilled across midnight count as one wave);
 *   3. keep the good ones: rating ≥ HERO_MIN_RATING (default 8.5), a real
 *      tt-cover + backdrop (the hero is a visual surface), and for series at
 *      least one episode (the hero's Play button must work);
 *   4. prefer series, fill the remaining slots with top movies if the series
 *      pool is thin;
 *   5. order by rating → trendingScore, take HERO_COUNT (default 8),
 *      un-feature everything else.
 *
 * Manual override: put IMDb tt-ids in HERO_TT below to pin an exact lineup
 * (matching is by the tt-id inside the poster path, robust to slug renames).
 *
 * Usage:
 *   node scripts/feature-new-hero.mjs                # auto-curate (writes)
 *   node scripts/feature-new-hero.mjs --dry-run      # show the picks only
 *   HERO_MIN_RATING=8.0 HERO_COUNT=6 node scripts/feature-new-hero.mjs
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
const COUNT = Number(process.env.HERO_COUNT ?? 8);
const MIN_RATING = Number(process.env.HERO_MIN_RATING ?? 8.5);
const WAVE_WINDOW_H = Number(process.env.HERO_WAVE_WINDOW_H ?? 72);

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
  // NOTE: Title.createdAt is stored in MIXED SQLite representations — the
  // 14k base rows are numeric epochs, newer sync waves are "YYYY-MM-DD
  // HH:MM:SS" text (and some ISO "T" strings). Prisma's typed aggregate/
  // where-casts choke on that (P2023), so the whole picker is raw SQL.
  // Numeric rows sort before any text in SQLite's cross-type ordering, so
  // `createdAt >= <text floor>` naturally selects only the recent waves.
  const maxRow = await db.$queryRawUnsafe(`SELECT MAX(createdAt) AS m FROM "Title"`);
  const anchor = maxRow?.[0]?.m;
  if (!anchor) throw new Error("no createdAt data — run the content sync first");
  const anchorMs = Date.parse(String(anchor).replace(" ", "T") + (String(anchor).includes("Z") ? "" : "Z"));
  if (Number.isNaN(anchorMs)) throw new Error(`unparseable wave anchor: ${anchor}`);
  const floor = new Date(anchorMs - WAVE_WINDOW_H * 3600_000)
    .toISOString().slice(0, 19).replace("T", " ");
  console.log(`wave: anchor ${String(anchor).slice(0, 10)} · floor ${floor.slice(0, 10)} · min rating ${MIN_RATING}`);

  const sel = `id, title, titleEn, year, rating, type`;
  const order = `ORDER BY rating DESC, trendingScore DESC`;
  const where = `createdAt >= ? AND rating >= ? AND poster LIKE '/covers/tt%' AND backdrop LIKE '/covers/tt%'`;

  const series = await db.$queryRawUnsafe(
    `SELECT ${sel} FROM "Title" WHERE ${where} AND type = 'series'
     AND EXISTS (SELECT 1 FROM "Episode" WHERE "Episode"."titleId" = "Title"."id")
     ${order} LIMIT ${COUNT}`,
    floor, MIN_RATING,
  );
  let picks = series;
  if (picks.length < COUNT) {
    const movies = await db.$queryRawUnsafe(
      `SELECT ${sel} FROM "Title" WHERE ${where} AND type = 'movie' ${order} LIMIT ${COUNT - picks.length}`,
      floor, MIN_RATING,
    );
    picks = [...picks, ...movies];
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
